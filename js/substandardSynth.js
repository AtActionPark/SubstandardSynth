(function(){
	//global variables, same for all synths. Mostly magic numbers
	const baseOscNumber = 5;
	const compressorThreshold = -1;
	const compressorRatio = 100;

	const maxGain = 100;
	const maxDistortion = 100;
	const distortionFactor = 5;//the smaller the distortion factor, the bigger the distortion
	const maxPeakLevel = 100;
	const maxSustainLevel = 100;
	const maxAttackTime = 9999;
	const maxDecayTime = 9999;
	//goes to 9999 also, value 10000 codes for infinity: will only stop when user releases key
	const maxSustainTime = 10000;
	const maxReleaseTime = 9999;
	
	let seed = Math.random();
	

	///SYNTH///

	//Constructor
	SubstandardSynth = function(params){
		//user params for synth
		//If no context is specified, create a new one
		this.context = params.context || new AudioContext;
		//outNode is the audioNode to which the synth will be connected
		this.outNode = params.outNode || this.context.createGain();
		//If no outNode is specified, create one and connect it directly to the audiocontext destination
		if(!params.outNode){
			this.outNode = this.context.createGain();
			this.outNode.gain.value = 1;
			this.outNode.connect(this.context.destination)
		}
		this.allowExport = params.export || false;
		this.pageRoot = params.pageRoot 
		//Number of polyphony
		//1 will be a bit wonky due to the way the envelopes are coded
		this.voicesNumber = params.voices || 8;
		//default values on synth creation
		this.oscillatorsParams = params.defaultOscillators || [{wave: 'square', detune: 0}];
		this.noisesParams = params.defaultNoises || [];
		this.filtersParams = params.defaultFilters || [{type:'lowpass',frequency:20000,q:1}]
		//Filter always contain one hidden filter
		//The default is a dummy 20kh lowpass
		if (params.defaultFilters)
			this.filtersParams.unshift({type:'lowpass',frequency:20000,q:1})

		//all filters will have a gain and detune options of 0
		this.filtersParams.forEach(p=>{p.gain = 0;p.detune = 0})

		if(params.defaultEnvelope == undefined)
			params.defaultEnvelope = {peakLevel:0.8,
								sustainLevel:0.3,
								attackTime:0.1,
								decayTime:0.1,
								releaseTime:0.1,
								sustainTime:10};
		this.envelopeParams =  {peakLevel:params.defaultEnvelope.peakLevel||0.8,
								sustainLevel:params.defaultEnvelope.sustainLevel||0.3,
								attackTime:params.defaultEnvelope.attackTime||0.1,
								decayTime:params.defaultEnvelope.decayTime||0.1,
								releaseTime:params.defaultEnvelope.releaseTime||0.1,
								sustainTime:params.defaultEnvelope.sustainTime||10};
		this.distortionVal = params.distortion || 0;

		//user params for display
		this.synthDivID = params.ID || 'synth'
		this.height = params.height||400
		this.width = params.width||800
		if(params.topCaseSize != undefined)
			this.topCaseSize = params.topCaseSize
		else
			this.topCaseSize = 40;
		if(params.caseSize != undefined)
			this.caseSize = params.caseSize
		else
			this.caseSize = 20;
		if(params.outBorderSize != undefined)
			this.outBorderSize = params.outBorderSize
		else
			this.outBorderSize = 2;
		if(params.panelBorderSize != undefined)
			this.panelBorderSize = params.panelBorderSize
		else
			this.panelBorderSize = 1;
		this.panelBorderColor = params.panelBorderColor||'white'
		this.outBorderColor = params.outBorderColor||'white'
		this.borderColor = params.borderColor||'white'
		this.panelTextColor = params.panelTextColor||'black'
		this.caseColor = params.caseColor||'black'
		this.panelColor = params.panelColor||'#A9A9A9'
		this.panelTitleHeight = params.panelTitleHeight||20;
		this.panelTitleColor = params.panelTitleColor || 'green'
		if(params.display != undefined)
			this.displaySynth = params.display
		else
			this.displaySynth = true

		//hardcoded
		this.nbOfPanels = 5;
		
		//keep a reference of all the filters present
		this.filters = []
		//if true, the notes will have infinite sustain
		//will be computed according to the sustainTime value
		this.hold = true;

		//only used for rng
		this.chaos=0;
		this.sqrChaos=0;

		//main out node
		this.instrGainNode = this.context.createGain();
		this.instrGainNode.gain.value = 0.85;

	 	this.distortion = this.context.createWaveShaper();
	 	this.setDistortion(this.distortionVal)

		//hard coded comp
		this.compressor = this.context.createDynamicsCompressor()
		this.compressor.threshold.value = compressorThreshold;
		this.compressor.reduction.value = compressorRatio;
		this.compressor.attack.value = 0;

		//optional additional limiter
		this.limiter = this.context.createDynamicsCompressor();

		//routing: osc + noise -> filter -> compressor -> gain -> general mix
		//the osc + noise to filter will be handled once we know how many filters we will have
		this.distortion.connect(this.compressor);
		this.compressor.connect(this.instrGainNode);
		this.instrGainNode.connect(this.outNode);

		//Due to the way I coded sliders, they all search the value to modify in the same object
		//Not very elegant (the slider changes the controlParams which changes the params)
		//but it works...
		this.controlParams = {
			gain:85,
			attack:10,
			decay:10,
			sustain:10,
			release:10,
			peakLevel:10,
			sustainLevel:10,
			hold:true,
			distortion: 0,
			chaos:0
		}

		this.setUpAndConnectFilters()
		if(this.displaySynth)
			this.display()
		this.readURL()
		this.generateSound()
	}
	//refresh all values, reconnect filters and voices and generates seed based on inputs
	SubstandardSynth.prototype.generateSound = function(){
		if(this.displaySynth){
			this.refreshControlValues();
			this.refreshOscList();
			this.refreshNoisesList();
			this.refreshFiltersList();
		}
	  	
		this.setUpAndConnectFilters();

		this.setVoices();

		if(this.allowExport && this.displaySynth){
			let seed = this.generateSeed()
			let url = this.pageRoot + '?' +  seed
			document.getElementById(this.synthDivID + 'seedDivResult').href = url;
			document.getElementById(this.synthDivID + 'seedDivResult').innerHTML = 'Export: ' + url.trunc(this.width/9.5)
		}	
	}
	//grabs all the necessary params and puts them in the smallest possible object
	SubstandardSynth.prototype.encodeInstrAsJson = function(){
		let result = {}

		let o = {w:[],d:[]}
		this.oscillatorsParams.forEach(function(p){
			o.w.push(getKeyByValue(waves,p.wave))
			o.d.push(Math.round(100*p.detune)/100)
		})
		result.o = o

		let n = []
		this.noisesParams.forEach(function(p){
			n.push({t:parseInt(getKeyByValue(noises,p.type)),
				f:parseInt(getKeyByValue(filters,p.filterType)),
				v:p.volume,
				c:p.cutoff})
		})
		result.n = n

		let f = []
		this.filtersParams.forEach(function(p){
			f.push({t:parseInt(getKeyByValue(filters,p.type)),
				c:p.frequency,
				q:Math.round(100*p.q)/100})
		})
		result.f = f

		result.e = {a:Math.round(100*this.envelopeParams.attackTime)/100,
			d:Math.round(100*this.envelopeParams.decayTime)/100,
			s:Math.round(100*this.envelopeParams.sustainTime)/100,
			r:Math.round(100*this.envelopeParams.releaseTime)/100,
			l:Math.round(100*this.envelopeParams.peakLevel)/100,
			L:Math.round(100*this.envelopeParams.sustainLevel)/100}

		result.d = Math.round(this.distortionVal)

		let r = JSON.stringify(result)
		return r
	}
	//set all the synth params according to an encoded object
	SubstandardSynth.prototype.decodeFromJson = function(json){
		let osc = []

		for(let i = 0;i<json.o.w.length;i++){
			osc.push({wave:waves[json.o.w[i]],
				detune:json.o.d[i]
			})
		}

		this.oscillatorsParams = osc

		this.noisesParams = json.n.map(p=>{
			return {type:noises[p.t],
					filterType:filters[p.f],
					volume:p.v,
					cutoff:p.c}})

		this.filtersParams = json.f.map(p=>{
			return {type:filters[p.t],
					frequency:p.c,
					q:p.q,
					detune:0,
					gain:0}})

		this.envelopeParams.attackTime = json.e.a
		this.envelopeParams.decayTime = json.e.d
		this.envelopeParams.sustainTime = json.e.s
		this.envelopeParams.releaseTime = json.e.r
		this.envelopeParams.peakLevel = json.e.l
		this.envelopeParams.sustainLevel = json.e.L

		this.distortionVal = json.d
		this.instrGainNode.gain.value = 0.85
	}
	SubstandardSynth.prototype.generateSeed = function(){
		let json = this.encodeInstrAsJson()
		json = packJson(json)

		//console.log('Compressed json length: '+json.length)
		//console.log(json)

		let b64 = b64EncodeUnicode(json)

		//console.log('str to b64: ' + b64.length)
		//console.log(b64)

		return b64
	}
	SubstandardSynth.prototype.readSeed = function(seed){
		let encoded
		if(typeof(seed) == 'string'){
			encoded = seed
			//console.log('Reading from url: ' + encoded)
		}
		if(!encoded)
			return


		encoded = b64DecodeUnicode(encoded)
		let decoded  = unpackJson(encoded);

		this.decodeFromJson(decoded)

		if(this.displaySynth){
			this.refreshControlValues();
			this.refreshOscList();
			this.refreshNoisesList();
			this.refreshFiltersList();
			document.getElementById(this.synthDivID + 'seedDivResult').href = this.generateSeed(seed);
		}
		
		this.setUpAndConnectFilters();
		this.setVoices();
	}
	//helper to read seed from url
	SubstandardSynth.prototype.readURL = function(){
	  const url = window.location.href ;
	  if(url.includes("?")){
	    let captured = /\?([^&]+)/.exec(url)[1]; 
	    this.readSeed(captured)
	    return true
	  }
	  return false;
	}
	//Takes input params and create osc list
	SubstandardSynth.prototype.setOscillators= function(){
		let args = Array.prototype.slice.call(arguments);
		let osc = this.oscillatorsParams
		args.forEach(function(a){
			osc.push(a)
		})
		this.oscillatorsParams = osc
	}
	//Takes input params and create noise list
	SubstandardSynth.prototype.setNoises= function(){
		let args = Array.prototype.slice.call(arguments);
		let noise = this.noisesParams
		args.forEach(function(a){
			noise.push(a)
		})
		this.noisesParams = noise
	}
	//Takes input params and set SubstandardSynth params
	SubstandardSynth.prototype.setEnvelope = function(peak,sustain,a,d,r,s){
		this.envelopeParams.peakLevel = peak || 0.3;
		this.envelopeParams.sustainLevel = sustain || 0.1;
		this.envelopeParams.attackTime = a || 0.5;
		this.envelopeParams.decayTime = d || 0.5;
		this.envelopeParams.releaseTime = r || 0.5;
		this.envelopeParams.sustainTime = s || 0.5;
	}
	//Takes input params and set SubstandardSynth params
	SubstandardSynth.prototype.setFilters = function(type,freq,detune,Q,gain){
		let f = this.context.createBiquadFilter()
		f.type = type;
		f.frequency.value = freq;
		f.Q.value = Q;
		f.detune.value = detune;
		f.gain.value = gain;

		//this.filters.push[f]
		this.filtersParams.push({type:type,frequency:freq,detune:detune,q:Q,gain:gain})
	}
	//Takes input params and set SubstandardSynth params
	SubstandardSynth.prototype.setDistortion = function(amount){
		this.distortionVal = amount
		amount/=distortionFactor

		let k = typeof amount === 'number' ? amount : 50,
	    	n_samples = 44100,
	    	curve = new Float32Array(n_samples),
	    	deg = Math.PI / 180,
	    	i = 0,
	    	x;
		for ( ; i < n_samples; ++i ) {
		  x = i * 2 / n_samples - 1;
		  curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
		}

	  	this.distortion.curve = curve
	}
	SubstandardSynth.prototype.randomize=function(){
		this.oscillatorsParams = []
		this.noisesParams = []
		this.filtersParams = [{type:'lowpass',frequency:20000,detune:0,q:1,gain:0}]

		let limit = false
		let nbOsc = getRandomInt(1,baseOscNumber+this.sqrChaos*baseOscNumber);
		let nbOfFilters = getRandomInt(0,this.sqrChaos+1);

		this.instrGainNode.gain.value = 0.85;
		this.distortionVal =  100*getRandomFloat(0.0,this.chaos);
		this.setDistortion(this.distortionVal)

		for(let i = 0;i<nbOsc;i++){
			let wave = getRandomWave();
			let detune = getRandomInt(- this.sqrChaos*100,this.sqrChaos*100 )
			this.setOscillators({wave:wave,detune:detune})
		}

		let peakLevel = getRandomFloat(0.1,1/nbOsc);
		let sustainLevel = getRandomFloat(0.1,1/nbOsc);

		let attack = getRandomFloat(0,0.5+this.sqrChaos*4);
		let decay = getRandomFloat(0,0.5+this.sqrChaos*4);
		let release = getRandomFloat(0,1.5+this.sqrChaos*4);
		let sustain = getRandomFloat(0,1.5+this.sqrChaos*4);

		this.hold = getRandomFloat(0,1)<0.5? true:false
		if(this.hold)
			sustain = maxSustainTime/1000
		this.setEnvelope(peakLevel,sustainLevel,attack,decay,release,sustain) 

		
		for(let i = 0;i<nbOfFilters;i++){
			let filterType = getRandomFilter();
			let filterFreq = getRandomInt(200,10000);
			//highpass has a tendency to lower the volume a lot. We will limit and level later
			if(filterType == 'highpass'){
				filterFreq = getRandomInt(200,4000)
				limit = true;
			}
			let Q = getRandomInt(0,5+this.sqrChaos*10);
			this.setFilters(filterType,filterFreq,0,Q,0) 
		}
		if(limit)
			this.createLimiter()

		let noiseType = getRandomNoise();
		let noiseFilterType = getRandomFilter()
		let noiseFilterCutoff = getRandomInt(200,10000);
		let noiseFilterVolume = Math.round(100*getRandomFloat(0,0.2+5*this.sqrChaos))/100;

		this.setNoises({type:noiseType,filterType:noiseFilterType,cutoff:noiseFilterCutoff,volume:noiseFilterVolume})
		
		
		this.generateSound()
	}
	//Compresses and raises the gain by a fixed value
	SubstandardSynth.prototype.createLimiter = function(){
		this.limiter.threshold.value = -24; 
		this.limiter.knee.value = 0.0; 
		this.limiter.ratio.value = 20.0;
		this.limiter.attack.value = 0.005; 
		this.limiter.release.value = 0.050; 
		this.instrGainNode.gain.value+=0.15

		this.filters[this.filters.length-1].connect(this.limiter)
		this.limiter.connect(this.distortion)
	}
	//Find a free voice and play note
	SubstandardSynth.prototype.playNote = function(frequency,time){
		//find free voice if possible
	    for(let i = 0;i<this.voices.length;i++){
	    	if(this.voices[i].status == "notPlaying"){
	    		this.voices[i].start(frequency,time);
	    		break;
	    	}
		}
	}
	//Find the voice playing a note and stop it
	SubstandardSynth.prototype.stopNote = function(frequency,time){
	    //find voice playing the released note
	    for(let i = 0;i<this.voices.length;i++){
	    	if(this.voices[i].status == "playing" && this.voices[i].name == frequency){
	    		this.voices[i].stop(time);
	    		break;
	    	}
	    }
	}
	//Play a note for x seconds
	SubstandardSynth.prototype.remotePlayNotes = function(notes,time,duration){
		if (!Array.isArray(notes))
			notes = [notes]
		for(let i = 0;i<notes.length;i++){
			//if the frequency is not a note, 
			if(isNaN(parseFloat(notes[i])) && !isFinite(notes[i]))
				notes[i] = getFrequency(notes[i])
		}

		for (let i = 0;i<notes.length;i++){
			this.voices[i].playWithSetDuration(notes[i],time,duration)
		}
	}
	//Reset the voices list and create new voices with instr params
	SubstandardSynth.prototype.setVoices = function(){
		this.voices = []
		for (let i =0;i<this.voicesNumber;i++){
			this.voices.push(new Voice(this.context, i+1,this.oscillatorsParams,this.noisesParams,this.envelopeParams,this.instrGainNode,this.filters, this.hold))
		}
	}
	//loop through the filtersParams array, create filters and connect everything
	SubstandardSynth.prototype.setUpAndConnectFilters = function(){
		//disconnect the last filter and reset the filters array
		if(this.filters.length>0){
			this.filters[this.filters.length-1].disconnect()
		}
		this.filters.length = 0
		//for all filtersParams, create a filter and add it to the list
		for(let i = 0;i<this.filtersParams.length;i++){
			let f  = this.context.createBiquadFilter();
			f.type = this.filtersParams[i].type;
			f.frequency.value = this.filtersParams[i].frequency;
			f.detune.value = this.filtersParams[i].detune;
			f.Q.value = this.filtersParams[i].q;
			f.gain.value = this.filtersParams[i].gain;

			this.filters.push(f)
		}
		//connect each filter to its successor
		for(let i = 0;i<this.filters.length-1;i++){
			this.filters[i].connect(this.filters[i+1])
		}
		//connect the last filter to the distortion
		this.filters[this.filters.length-1].connect(this.distortion)	
	}
	//debug - kill all voices and disconnect/reconnect
	SubstandardSynth.prototype.kill = function(){
		for(let i = 0;i<this.voices.length;i++)
			this.voices[i].stop(0)

		this.refreshFiltersList()
		this.setUpAndConnectFilters()
		this.setVoices()
	}
	//Create the html/css/event handlers for the synth
	SubstandardSynth.prototype.display = function(){
		this.interiorHeight = this.height - this.caseSize - this.topCaseSize
		this.interiorWidth = this.width - 2*this.caseSize  - 2*this.panelBorderSize - 2*this.outBorderSize

		this.panelHeight = this.interiorHeight - 2*this.panelBorderSize
		this.panelWidth = this.interiorWidth/this.nbOfPanels-2*this.panelBorderSize

		let synthDiv = document.getElementById(this.synthDivID)

		let synthFull = document.createElement("div")
		synthFull.style.height= this.height + 'px';
		synthFull.style.width= this.width + 'px';
		synthFull.style.backgroundColor = 'white';
		synthFull.style.position = 'relative'
		synthFull.style.backgroundColor = this.caseColor
		synthFull.style.border = 'solid ' + this.outBorderSize + 'px ' + this.outBorderColor
		synthFull.style.fontFamily= 'Courier, sans-serif';
    	synthFull.style.fontSize='14px';

		let synth = document.createElement("div")
		synth.style.height= this.interiorHeight + 'px';
		synth.style.width= this.interiorWidth + 'px';
		synth.style.position = 'absolute'
		synth.style.top = this.topCaseSize + 'px'
		synth.style.left = this.caseSize + 'px'
		synth.style.border = 'solid ' + this.panelBorderSize + 'px ' + this.panelBorderColor;

		for(let i = 0;i<this.nbOfPanels;i++){
			synth.appendChild(this.addPanel(i))
		}

		synthFull.appendChild(synth)
		synthDiv.appendChild(synthFull)

		let seedDivResult = document.createElement("a")
		seedDivResult.id = this.synthDivID + 'seedDivResult'
		seedDivResult.innerHTML = ''
		seedDivResult.style.width = this.width-2*this.outBorderSize + 'px'
		seedDivResult.style.position = 'absolute'
		seedDivResult.style.bottom = '0px'
		seedDivResult.style.left = this.caseSize +  'px'
		seedDivResult.style.color='white'
		synthFull.appendChild(seedDivResult)

		this.addControlsToPanels()
		this.refreshControlValues()
		this.refreshFiltersList()
		this.refreshOscList()
	}
	//Creates the html part of a specific panel
	SubstandardSynth.prototype.addPanel = function(index){
		let titleDiv = document.createElement("div")
		titleDiv.id = this.synthDivID + 'PanelTitle'+ index
		titleDiv.innerHTML = panelNames[index]
		titleDiv.style.backgroundColor = this.panelTitleColor

		let el = document.createElement("div")
		el.id = this.synthDivID + 'Panel' + index
		el.style.height= this.panelHeight+ 'px';
		el.style.width= this.panelWidth+ 'px';
		el.style.position = 'absolute'
		el.style.left = index*(this.panelWidth+2*this.panelBorderSize) + 'px'
		el.style.backgroundColor = this.panelColor;
		el.style.border = 'solid ' + this.panelBorderSize + 'px ' + this.panelBorderColor;

		el.appendChild(titleDiv)

		return el
	}
	//Manually specify how to fill each panel
	SubstandardSynth.prototype.addControlsToPanels = function(){
		//OSC PANEL
		let oscPanel = document.getElementById(this.synthDivID + 'Panel0')
		oscPanel.appendChild(this.setUpOscPanel(0))

		//NOISE PANEL
		let noisePanel = document.getElementById(this.synthDivID + 'Panel1')
		noisePanel.appendChild(this.setUpNoisePanel(0))

		//ENVELOPE PANEL
		let envelopePanel = document.getElementById(this.synthDivID + 'Panel2')
		envelopePanel.appendChild(this.addSlider('Attack','attack',0,1,maxAttackTime,true))
		envelopePanel.appendChild(this.addSlider('Decay','decay',40,1,maxDecayTime,true))
		envelopePanel.appendChild(this.addSlider('Sustain','sustain',80,1,maxSustainTime,true))
		envelopePanel.appendChild(this.addSlider('Release','release',120,1,maxReleaseTime,true))

		envelopePanel.appendChild(this.addSlider('Peak Level','peakLevel',160,1,maxPeakLevel))
		envelopePanel.appendChild(this.addSlider('Sus. Level','sustainLevel',200,1,maxSustainLevel))
		

		//OPTIONS PANEL
		let optionsPanel = document.getElementById(this.synthDivID + 'Panel4')
		optionsPanel.appendChild(this.addSlider('Gain','gain',0,1,maxGain))
		optionsPanel.appendChild(this.addSlider('Distortion','distortion',40,0,maxDistortion))
		optionsPanel.appendChild(this.addSlider('Chaos','chaos',this.panelHeight-105,0,100))

		let random = document.createElement("button")
		random.innerHTML = 'Randomize'
		random.onclick = this.randomize.bind(this)
		random.style.position = 'absolute'
		random.style.bottom	= '15px'
		random.style.left	= '10px'
		optionsPanel.appendChild(random)

		let kill = document.createElement("button")
		kill.innerHTML = 'Kill'
		kill.onclick = this.kill.bind(this)
		kill.style.position = 'absolute'
		kill.style.bottom	= '100px'
		kill.style.left	= '10px'
		optionsPanel.appendChild(kill)

		//FILTER PANEL
		let filterPanel = document.getElementById(this.synthDivID + 'Panel3')
		filterPanel.appendChild(this.setUpFilterPanel(0))
	}
	//Creates and sets up a slider with html for a specific control
	//Control refers to the parameter the slider will control.
	//On change, the control value will be replaced by the slider value
	SubstandardSynth.prototype.addSlider = function(name,control,pos,min,max,sqr){
		let self = this;
		let resultDiv = document.createElement("div");
		resultDiv.style.position = 'absolute';
		resultDiv.style.top = pos + this.panelTitleHeight+'px';

		let controlName = document.createElement("p");
		controlName.innerHTML = name;
		controlName.style.width = '150px';
		controlName.style.position = 'absolute';
		controlName.style.left = '5px';
		controlName.style.margin = 0;
		controlName.style.padding = 0;
		controlName.style.color = this.panelTextColor;

		let value = document.createElement("p");
		value.id = control+'Value'
		value.innerHTML = this.controlParams[control];
		value.style.position = 'absolute';
		value.style.left =  this.panelWidth -35 + 'px';

		value.style.margin = 0;
		value.style.padding = 0;
		value.style.color = this.panelTextColor;

		resultDiv.appendChild(controlName)
		resultDiv.appendChild(value)
		
		let slider = document.createElement('input')
		slider.id = control+'Slider';
		slider.classList.add('slider');
		slider.style.position ='absolute';
		slider.style.left ='5px';
		slider.style.top ='15px';
		slider.style.width =(this.panelWidth-15) + 'px';
		slider.type = 'range'
		slider.min = min;
		slider.max = max;
		slider.step = 1;
		slider.value= this.controlParams[control];

		//On change, overwrite the slider params
		slider.onchange = function(){
			let v = this.value
			if(sqr)
				v = Math.round(Math.pow((v/max),2)*max)

			self.controlParams[control] = v
			value.innerHTML = v
			
			//sustain exception
			if(control == 'sustain' && this.value == maxSustainTime){
				value.innerHTML = '&#8734'
			}
			self.getUserInput()
		}
		resultDiv.appendChild(slider)

		return resultDiv
	}
	//Manually add all controls to the different panels
	SubstandardSynth.prototype.setUpOscPanel = function(pos){
		let self = this;

		let resultDiv = document.createElement("div");
		resultDiv.style.position = 'absolute';
		resultDiv.style.top = pos + this.panelTitleHeight+'px';

		//wave
		let wave = document.createElement("p");
		wave.innerHTML = 'Wave: ';
		wave.style.width = '150px';
		wave.style.position = 'absolute';
		wave.style.left = '5px';
		wave.style.margin = 0;
		wave.style.padding = 0;
		wave.style.color = this.panelTextColor;

		resultDiv.appendChild(wave)

		let dropBoxWave = document.createElement('select')
		let dropBoxWavesOptions = ['sine','square','triangle','sawtooth']
		for (let i = 0; i < dropBoxWavesOptions.length; i++) {
		    let option = document.createElement("option");
		    option.value = dropBoxWavesOptions[i];
		    option.text = dropBoxWavesOptions[i];
		    dropBoxWave.appendChild(option);
		}
		dropBoxWave.id = 'waveDropBox'
		dropBoxWave.classList.add('dropBox');
		dropBoxWave.style.position ='absolute';
		dropBoxWave.style.left ='5px';
		dropBoxWave.style.top ='20px';
		dropBoxWave.type = 'text'

		resultDiv.appendChild(dropBoxWave)

		//Detune
		let detune = document.createElement("p");
		detune.innerHTML = 'Detune: ';
		detune.style.width = '150px';
		detune.style.position = 'absolute';
		detune.style.left = '5px';
		detune.style.top = '45px';
		detune.style.margin = 0;
		detune.style.padding = 0;
		detune.style.color = this.panelTextColor;

		resultDiv.appendChild(detune)

		let inputDetune = document.createElement('input')
		inputDetune.id = 'detuneNumberBox'
		inputDetune.type = 'number'
		inputDetune.value = 0
		inputDetune.classList.add('numberBox');
		inputDetune.style.position ='absolute';
		inputDetune.style.left ='5px';
		inputDetune.style.top ='65px';
		inputDetune.style.width = '60px'

		resultDiv.appendChild(inputDetune)

		let submit = document.createElement('button')
		submit.innerHTML = 'Add'
		submit.style.position ='absolute';
		submit.style.left ='5px';
		submit.style.top ='95px';

		submit.onclick = function(){
			let w = dropBoxWave.options[dropBoxWave.selectedIndex].value;
			let d = parseFloat(inputDetune.value) ||0;
			self.oscillatorsParams.push({wave:w,detune:d})
			self.generateSound()
		}

		resultDiv.appendChild(submit)

		//Oscillators
		let osc = document.createElement("p");
		osc.innerHTML = 'Oscillators: ';
		osc.style.width = '150px';
		osc.style.position = 'absolute';
		osc.style.left = '5px';
		osc.style.top = '140px';
		osc.style.margin = 0;
		osc.style.padding = 0;
		osc.style.color = this.panelTextColor;

		let dropBoxOsc = document.createElement('select')
		dropBoxOsc.id = 'oscillatorsDropBox'
		dropBoxOsc.classList.add('dropBox');
		dropBoxOsc.style.position ='absolute';
		dropBoxOsc.style.left ='5px';
		dropBoxOsc.style.top ='160px';
		dropBoxOsc.type = 'text'

		resultDiv.appendChild(osc)
		resultDiv.appendChild(dropBoxOsc)

		let remove = document.createElement('button')
		remove.innerHTML = 'Remove'
		remove.style.position ='absolute';
		remove.style.left ='5px';
		remove.style.top ='190px';

		remove.onclick = function(){
			let w = dropBoxOsc.options[dropBoxOsc.selectedIndex].value;
			self.oscillatorsParams.splice(dropBoxOsc.selectedIndex, 1);
			self.generateSound()
		}

		resultDiv.appendChild(remove)

		return resultDiv
	}
	SubstandardSynth.prototype.setUpNoisePanel = function(pos){
		let self = this;

		let resultDiv = document.createElement("div");
		resultDiv.style.position = 'absolute';
		resultDiv.style.top = pos + this.panelTitleHeight+'px';

		//Type
		let type = document.createElement("p");
		type.innerHTML = 'Noise type: ';
		type.style.width = '150px';
		type.style.position = 'absolute';
		type.style.left = '5px';
		type.style.margin = 0;
		type.style.padding = 0;
		type.style.color = this.panelTextColor;

		resultDiv.appendChild(type)

		let dropBoxType = document.createElement('select')
		let dropBoxTypesOptions = ['white','pink','brownian']
		for (let i = 0; i < dropBoxTypesOptions.length; i++) {
		    let option = document.createElement("option");
		    option.value = dropBoxTypesOptions[i];
		    option.text = dropBoxTypesOptions[i];
		    dropBoxType.appendChild(option);
		}
		dropBoxType.id = 'typeDropBox'
		dropBoxType.classList.add('dropBox');
		dropBoxType.style.position ='absolute';
		dropBoxType.style.left ='5px';
		dropBoxType.style.top ='20px';
		dropBoxType.type = 'text'

		resultDiv.appendChild(dropBoxType)

		//Filter Volume
		let filterVolume = document.createElement("p");
		filterVolume.innerHTML = 'Volume: ';
		filterVolume.style.width = '150px';
		filterVolume.style.position = 'absolute';
		filterVolume.style.left = '5px';
		filterVolume.style.top = '45px';
		filterVolume.style.margin = 0;
		filterVolume.style.padding = 0;
		filterVolume.style.color = this.panelTextColor;

		resultDiv.appendChild(filterVolume)

		let inputFilterVolume = document.createElement('input')
	
		inputFilterVolume.id = 'filterVolumeNumberBox'
		inputFilterVolume.type = 'number'
		inputFilterVolume.value = 0
		inputFilterVolume.classList.add('numberBox');
		inputFilterVolume.style.position ='absolute';
		inputFilterVolume.style.left ='5px';
		inputFilterVolume.style.top ='65px';
		inputFilterVolume.style.width = '60px'

		resultDiv.appendChild(inputFilterVolume)

		//filter type
		let filterType = document.createElement("p");
		filterType.innerHTML = 'Filter Type: ';
		filterType.style.width = '150px';
		filterType.style.position = 'absolute';
		filterType.style.left = '5px';
		filterType.style.top = '90px';
		filterType.style.margin = 0;
		filterType.style.padding = 0;
		filterType.style.color = this.panelTextColor;

		resultDiv.appendChild(filterType)

		let dropBoxFilterType = document.createElement('select')
		let dropBoxFilterTypesOptions = ['highpass','lowpass','bandpass','notch']
		for (let i = 0; i < dropBoxFilterTypesOptions.length; i++) {
		    let option = document.createElement("option");
		    option.value = dropBoxFilterTypesOptions[i];
		    option.text = dropBoxFilterTypesOptions[i];
		    dropBoxFilterType.appendChild(option);
		}
		dropBoxFilterType.id = 'typeDropBox'
		dropBoxFilterType.classList.add('dropBox');
		dropBoxFilterType.style.position ='absolute';
		dropBoxFilterType.style.left ='5px';
		dropBoxFilterType.style.top ='110px';
		dropBoxFilterType.type = 'text'

		resultDiv.appendChild(dropBoxFilterType)

		//Filter cutoff
		let filterCutoff = document.createElement("p");
		filterCutoff.innerHTML = 'Filter Cutoff: ';
		filterCutoff.style.width = '150px';
		filterCutoff.style.position = 'absolute';
		filterCutoff.style.left = '5px';
		filterCutoff.style.top = '135px';
		filterCutoff.style.margin = 0;
		filterCutoff.style.padding = 0;
		filterCutoff.style.color = this.panelTextColor;

		resultDiv.appendChild(filterCutoff)

		let inputFilterCutoff = document.createElement('input')
	
		inputFilterCutoff.id = 'filterCutoffNumberBox'
		inputFilterCutoff.type = 'number'
		inputFilterCutoff.value = 0
		inputFilterCutoff.classList.add('numberBox');
		inputFilterCutoff.style.position ='absolute';
		inputFilterCutoff.style.left ='5px';
		inputFilterCutoff.style.top ='155px';
		inputFilterCutoff.style.width = '60px'

		resultDiv.appendChild(inputFilterCutoff)

		

		let submit = document.createElement('button')
		submit.innerHTML = 'Add'
		submit.style.position ='absolute';
		submit.style.left ='5px';
		submit.style.top ='185px';

		submit.onclick = function(){
			let t = dropBoxType.options[dropBoxType.selectedIndex].value;
			let ft = dropBoxFilterType.options[dropBoxFilterType.selectedIndex].value;

			let q = parseInt(inputFilterCutoff.value) ||0;
			let v = parseFloat(inputFilterVolume.value) ||0;

			self.noisesParams.push({type:t,filterType:ft,cutoff:q,volume:v})

			self.generateSound()
		}

		resultDiv.appendChild(submit)


		//Noises
		let noise = document.createElement("p");
		noise.innerHTML = 'Noises list: ';
		noise.style.width = '150px';
		noise.style.position = 'absolute';
		noise.style.left = '5px';
		noise.style.top = '225px';
		noise.style.margin = 0;
		noise.style.padding = 0;
		noise.style.color = this.panelTextColor;


		let dropBoxNoise = document.createElement('select')
		dropBoxNoise.id = 'noisesDropBox'
		dropBoxNoise.classList.add('dropBox');
		dropBoxNoise.style.position ='absolute';
		dropBoxNoise.style.left ='5px';
		dropBoxNoise.style.top ='245px';
		dropBoxNoise.type = 'text'

		resultDiv.appendChild(noise)
		resultDiv.appendChild(dropBoxNoise)

		let remove = document.createElement('button')
		remove.innerHTML = 'Remove'
		remove.style.position ='absolute';
		remove.style.left ='5px';
		remove.style.top ='275px';

		remove.onclick = function(){
			self.noisesParams.splice(dropBoxNoise.selectedIndex, 1);
			self.generateSound()
		}

		resultDiv.appendChild(remove)

		return resultDiv
	}
	SubstandardSynth.prototype.setUpFilterPanel = function(pos){
		let self = this;

		let resultDiv = document.createElement("div");
		resultDiv.style.position = 'absolute';
		resultDiv.style.top = pos + this.panelTitleHeight+'px';

		//filter type
		let filterType = document.createElement("p");
		filterType.innerHTML = 'Filter Type: ';
		filterType.style.width = '150px';
		filterType.style.position = 'absolute';
		filterType.style.left = '5px';
		filterType.style.top = '0px';
		filterType.style.margin = 0;
		filterType.style.padding = 0;
		filterType.style.color = this.panelTextColor;

		resultDiv.appendChild(filterType)

		let dropBoxFilterType = document.createElement('select')
		let dropBoxFilterTypesOptions = ['highpass','lowpass','bandpass','notch']
		for (let i = 0; i < dropBoxFilterTypesOptions.length; i++) {
		    let option = document.createElement("option");
		    option.value = dropBoxFilterTypesOptions[i];
		    option.text = dropBoxFilterTypesOptions[i];
		    dropBoxFilterType.appendChild(option);
		}
		dropBoxFilterType.id = 'typeDropBox'
		dropBoxFilterType.classList.add('dropBox');
		dropBoxFilterType.style.position ='absolute';
		dropBoxFilterType.style.left ='5px';
		dropBoxFilterType.style.top ='20px';
		dropBoxFilterType.type = 'text'

		resultDiv.appendChild(dropBoxFilterType)

		//Filter cutoff
		let filterCutoff = document.createElement("p");
		filterCutoff.innerHTML = 'Filter Cutoff: ';
		filterCutoff.style.width = '150px';
		filterCutoff.style.position = 'absolute';
		filterCutoff.style.left = '5px';
		filterCutoff.style.top = '45px';
		filterCutoff.style.margin = 0;
		filterCutoff.style.padding = 0;
		filterCutoff.style.color = this.panelTextColor;

		resultDiv.appendChild(filterCutoff)

		let inputFilterCutoff = document.createElement('input')
	
		inputFilterCutoff.id = 'filterCutoffNumberBox'
		inputFilterCutoff.type = 'number'
		inputFilterCutoff.value = 0
		inputFilterCutoff.classList.add('numberBox');
		inputFilterCutoff.style.position ='absolute';
		inputFilterCutoff.style.left ='5px';
		inputFilterCutoff.style.top ='65px';
		inputFilterCutoff.style.width = '60px'

		resultDiv.appendChild(inputFilterCutoff)

		//Filter Q
		let filterQ = document.createElement("p");
		filterQ.innerHTML = 'Filter Q: ';
		filterQ.style.width = '150px';
		filterQ.style.position = 'absolute';
		filterQ.style.left = '5px';
		filterQ.style.top = '90px';
		filterQ.style.margin = 0;
		filterQ.style.padding = 0;
		filterQ.style.color = this.panelTextColor;

		resultDiv.appendChild(filterQ)

		let inputFilterQ = document.createElement('input')
	
		inputFilterQ.id = 'filterQNumberBox'
		inputFilterQ.type = 'number'
		inputFilterQ.value = 0
		inputFilterQ.classList.add('numberBox');
		inputFilterQ.style.position ='absolute';
		inputFilterQ.style.left ='5px';
		inputFilterQ.style.top ='110px';
		inputFilterQ.style.width = '60px'

		resultDiv.appendChild(inputFilterQ)


		let submit = document.createElement('button')
		submit.innerHTML = 'Add'
		submit.style.position ='absolute';
		submit.style.left ='5px';
		submit.style.top ='140px';

		submit.onclick = function(){
			let t = dropBoxFilterType.options[dropBoxFilterType.selectedIndex].value;
			let f = parseInt(inputFilterCutoff.value) ||0;
			let d = 0;
			let q = parseInt(inputFilterQ.value) ||0;
			let g = 0;

			self.filtersParams.push({type:t,frequency:f,detune:d,q:q,gain:g})

			self.generateSound()
		}

		resultDiv.appendChild(submit)


		//Filters
		let filter = document.createElement("p");
		filter.innerHTML = 'Filters: ';
		filter.style.width = '150px';
		filter.style.position = 'absolute';
		filter.style.left = '5px';
		filter.style.top = '225px';
		filter.style.margin = 0;
		filter.style.padding = 0;
		filter.style.color = this.panelTextColor;


		let dropBoxFilter = document.createElement('select')
		dropBoxFilter.id = 'filtersDropBox'
		dropBoxFilter.classList.add('dropBox');
		dropBoxFilter.style.position ='absolute';
		dropBoxFilter.style.left ='5px';
		dropBoxFilter.style.top ='245px';
		dropBoxFilter.type = 'text'

		resultDiv.appendChild(filter)
		resultDiv.appendChild(dropBoxFilter)

		let remove = document.createElement('button')
		remove.innerHTML = 'Remove'
		remove.style.position ='absolute';
		remove.style.left ='5px';
		remove.style.top ='275px';

		remove.onclick = function(){
			//first option is hidden
			if(self.filters.length<=1)
				return
			self.filtersParams.splice(dropBoxFilter.selectedIndex+1, 1);
			self.generateSound()
		}

		resultDiv.appendChild(remove)

		return resultDiv
	}
	//The dropbox lists options are dependant what the user added (osc, noises, filters)
	// We need to refresh the options and rebuild the dropboxes after each input
	SubstandardSynth.prototype.refreshOscList = function(){
		let dropBox = document.getElementById('oscillatorsDropBox')

		let dropBoxOscsOptions = []

		for(let i = 0;i<this.oscillatorsParams.length;i++){
			dropBoxOscsOptions.push({wave:this.oscillatorsParams[i].wave,detune:this.oscillatorsParams[i].detune})
		}

		dropBox.options.length = 0
		for (let i = 0; i < dropBoxOscsOptions.length; i++) {
		    let option = document.createElement("option");
		    option.value = dropBoxOscsOptions[i].wave;
		    option.text = dropBoxOscsOptions[i].wave + ' - d: ' + Math.round(dropBoxOscsOptions[i].detune*100)/100;
		    dropBox.appendChild(option);
		}
	}
	SubstandardSynth.prototype.refreshNoisesList = function(){
		let dropBox = document.getElementById('noisesDropBox')

		let dropBoxNoisesOptions = []

		for(let i = 0;i<this.noisesParams.length;i++){
			dropBoxNoisesOptions.push({type:this.noisesParams[i].type,
									filterType:this.noisesParams[i].filterType,
									cutoff:this.noisesParams[i].cutoff,
									volume:this.noisesParams[i].volume,})
		}

		dropBox.options.length = 0
		for (let i = 0; i < dropBoxNoisesOptions.length; i++) {
		    let option = document.createElement("option");
		    option.value = dropBoxNoisesOptions[i].type;
		    option.text = dropBoxNoisesOptions[i].type.charAt(0) + '-' 
		    + dropBoxNoisesOptions[i].filterType.charAt(0)+ '-' 
		    + dropBoxNoisesOptions[i].cutoff+ '-' 
		    + Math.round(dropBoxNoisesOptions[i].volume * 100) / 100;
		    dropBox.appendChild(option);
		}
	}
	SubstandardSynth.prototype.refreshFiltersList = function(){
		let dropBox = document.getElementById('filtersDropBox')

		let dropBoxFiltersOptions = []

		for(let i = 1;i<this.filtersParams.length;i++){
			dropBoxFiltersOptions.push({type:this.filtersParams[i].type,
									frequency:this.filtersParams[i].frequency,
									detune:this.filtersParams[i].detune,
									q:this.filtersParams[i].q,
									gain:this.filtersParams[i].gain})
		}

		dropBox.options.length = 0
		for (let i = 0; i < dropBoxFiltersOptions.length; i++) {
		    let option = document.createElement("option");
		    option.value = dropBoxFiltersOptions[i].type;
		    option.text = dropBoxFiltersOptions[i].type.charAt(0) + '-' 
		    + dropBoxFiltersOptions[i].frequency+ '-' 
		    + Math.round(dropBoxFiltersOptions[i].q*10)/10; 
		    dropBox.appendChild(option);
		}
	}
	//sqrt and max are used for non linear sliders
	SubstandardSynth.prototype.setControl = function(control,value,sqr,max){
		let resultV = value
		if(sqr){
			resultV =  Math.sqrt((value/max),2)*max
		}
		let v;
		//show infinity for max sustain value
		if(control =='sustain' && value == maxSustainTime)
			v = '&#8734'
		else
			v = Math.round(value)

		this.controlParams[control] = Math.round(value)
		document.getElementById(control+'Slider').value = Math.round(resultV)
		document.getElementById(control+'Value').innerHTML = v
	}
	//For all the controls created through the addSlider stuff
	// Need to manually indicate
	SubstandardSynth.prototype.getUserInput = function(){
		//options
		this.instrGainNode.gain.value = this.controlParams.gain/maxGain;
		this.setDistortion(this.controlParams.distortion);
		this.chaos = this.controlParams.chaos/100.0
		this.sqrChaos = this.chaos*this.chaos

		//envelope
		this.envelopeParams.peakLevel = this.controlParams.peakLevel/maxPeakLevel;
		this.envelopeParams.sustainLevel = this.controlParams.sustainLevel/maxSustainLevel;

		this.envelopeParams.attackTime = this.controlParams.attack/1000;
		this.envelopeParams.decayTime = this.controlParams.decay/1000;
		this.envelopeParams.sustainTime = this.controlParams.sustain/1000;
		this.envelopeParams.releaseTime = this.controlParams.release/1000;

		if(this.envelopeParams.sustainTime == maxSustainTime/1000)
			this.hold = true
		else
			this.hold = false

		this.generateSound()
	}
	//When values are changed internally (ex randomize), we need to make sure the controls reflect the changes
	SubstandardSynth.prototype.refreshControlValues = function(){
		this.setControl('gain',this.instrGainNode.gain.value*maxGain)
		this.setControl('distortion',this.distortionVal)

		//envelope
		this.setControl('peakLevel',this.envelopeParams.peakLevel*maxPeakLevel)
		this.setControl('sustainLevel',this.envelopeParams.sustainLevel*maxSustainLevel)

		this.setControl('attack',this.envelopeParams.attackTime*1000,true,maxAttackTime)
		this.setControl('decay',this.envelopeParams.decayTime*1000,true,maxDecayTime)
		this.setControl('sustain',this.envelopeParams.sustainTime*1000,true,maxSustainTime)
		this.setControl('release',this.envelopeParams.releaseTime*1000,true,maxReleaseTime)
	}


	///VOICES///

	function Voice(context, number, oscillatorsParams,noisesParams,envelopeParams,instrGainNode,filters, hold){
		this.name = "empty";
		this.number = number;
		this.status = "notPlaying"
		this.context = context;
		this.filters = filters;
		this.oscillators = [];
		this.noises = [];
		this.hold = hold;
		this.oscillatorsParams = oscillatorsParams;
		this.noisesParams = noisesParams;
		this.instrGainNode = instrGainNode;
		this.envelopeParams = envelopeParams;
		this.gainNode = context.createGain();
		this.gainNode.gain.value = 0;
		this.gainNode.connect(this.filters[0]);

		this.lastGainValue = 0;
	}
	Voice.prototype.start =  function(frequency, time){
		let t = this.context.currentTime + time

		//Set voice status
		this.status = "playing";
	    this.name = frequency;

	    //kill oscillators playing on the voice if any
	    this.oscillators.forEach(o => {
			o.stop(t);
		});
		this.noises.forEach(n => {
			n.stop(t);
		});

		//reset oscillators array
	    this.oscillators = [];
		this.noises = [];
		//rebuild oscillators list and start them
		this.oscillatorsParams.forEach(o => {
			let osc = this.createOsc(o.wave,frequency + o.detune,this.gainNode)
			this.oscillators.push(osc)
			osc.start(t)
		})
		this.noisesParams.forEach(n => {
			let noise = this.createNoise(n.type,n.filterType,n.cutoff, n.volume, this.gainNode)
			this.noises.push(noise)
			noise.start(t)
		})

		//Envelope
		this.lastGainValue = this.gainNode.gain.value
		this.gainNode.gain.cancelScheduledValues(t)

		this.gainNode.gain.setValueAtTime(this.lastGainValue,t);

		//Attack
	    this.gainNode.gain.linearRampToValueAtTime(this.envelopeParams.peakLevel, t + this.envelopeParams.attackTime)
	    this.gainNode.gain.setValueAtTime(this.envelopeParams.peakLevel, t + this.envelopeParams.attackTime)
	    //Decay
	    this.gainNode.gain.linearRampToValueAtTime(this.envelopeParams.sustainLevel, t + this.envelopeParams.attackTime + this.envelopeParams.decayTime) 
	    this.gainNode.gain.setValueAtTime(this.envelopeParams.sustainLevel, t + this.envelopeParams.attackTime + this.envelopeParams.decayTime) 
	    //Sustain
	    
	    //Unless the synth can hold notes, 
	    if(!this.hold){
	    	this.gainNode.gain.setValueAtTime(this.envelopeParams.sustainLevel,t + this.envelopeParams.attackTime + this.envelopeParams.decayTime+ this.envelopeParams.sustainTime );
	    	
	    	let tRelease =  t + this.envelopeParams.attackTime + this.envelopeParams.decayTime + this.envelopeParams.sustainTime + this.envelopeParams.releaseTime
	    	//Release
	    	this.gainNode.gain.linearRampToValueAtTime(0.001, tRelease) 
	    	this.gainNode.gain.setValueAtTime(0,tRelease);
		}

		//console.log('Playing ' + frequency + ' on voice ' + this.number)
	}
	Voice.prototype.stop = async function(time){
		let t =  this.context.currentTime + time 

	    this.lastGainValue = this.gainNode.gain.value
		this.gainNode.gain.cancelScheduledValues(t)

		let tRelease = t + this.envelopeParams.releaseTime

		this.gainNode.gain.setValueAtTime(this.lastGainValue,t);

		this.gainNode.gain.exponentialRampToValueAtTime(0.001, tRelease) 
		this.gainNode.gain.setValueAtTime(0,tRelease);

		this.oscillators.forEach(o => {
			o.stop(tRelease);
		});
		this.noises.forEach(n => {
			n.stop(tRelease);
		});

		//wait a bit before marking the voice as free
		await sleep(this.releaseTime);
		this.status = "notPlaying";
	    this.name = "empty";
	}
	Voice.prototype.playWithSetDuration = function(freq,time,duration){
		this.start(freq,time);
		this.stop(time+duration);
	}
	//Helper to create and connect an osc 
	Voice.prototype.createOsc = function(wave,freq,gainNode){
		let source = this.context.createOscillator();
		source.frequency.value = freq
		source.type = wave;
		source.connect(gainNode);
		return source
	}
	//Helper to create and connect a noise
	Voice.prototype.createNoise = function(type,filterType,cutoff,volume,gainNode){
		let bufferSize = 2*this.context.sampleRate
		let buffer = this.context.createBuffer(1,bufferSize,this.context.sampleRate);
		let data = buffer.getChannelData(0);
		if(type == 'white')
			data = createWhiteNoise(data,volume)
		else if (type == 'pink')
			data = createPinkNoise(data,volume)
		else if (type == 'brownian')
			data = createBrownianNoise(data,volume)
	    let source = this.context.createBufferSource();
	    source.loop = true;
	    source.buffer = buffer
	 	
	 	let filter = this.context.createBiquadFilter();
		filter.type = filterType
		filter.frequency.value = cutoff

		source.connect(filter);
		filter.connect(gainNode)
		return source
	}


	///HELPERS && DICTS///
	const waves = {
	  0:'sine',
	  1:'square',
	  2:'triangle',
	  3:'sawtooth',
	}
	const noises = {
	  0:'white',
	  1:'pink',
	  2:'brownian',
	}
	const filters = {
	  0:'lowpass',
	  1:'highpass',
	  2:'bandpass',
	  3:'notch'
	}
	const panelNames = {0:'_OSC',
					1:'_NOISE',
					2:'_ENVELOPE',
					3:'_FILTER',
					4:'_MISC'
	}
	function sleep(s) {

  		return new Promise(resolve => setTimeout(resolve, s*1000));
	}
	//SEEDED RANDOMS. Stolen somewhere
	// Establish the parameters of the generator
	// a - 1 should be divisible by m's prime factors
	// c and m should be co-prime
	const m = 25;
	const a = 11;
	const c = 17;
	let rand = function() {
	  // define the recurrence relationship
	  seed = (a * seed + c) % m;
	  // returns a float in (0, 1) 
	  return seed/m;
	};
	//helper for random generation
	function getRandomFloat(a,b){

	  return rand()*(b-a) +a
	}
	function getRandomInt(a,b){

	  return Math.floor(rand()*(b - a + 1) + a);
	}
	function pickRandomProperty(obj) {
	    let keys = Object.keys(obj)
	    return keys[ keys.length * rand() << 0 ];
	}
	function pickRandomArray(arr) {

	    return arr[arr.length * rand() << 0 ];
	}
	function getRandomWave(){

	  return waves[pickRandomProperty(waves)]
	}
	function getRandomNoise(){

	  return noises[pickRandomProperty(noises)]
	}
	function getRandomFilter(){

	  return filters[pickRandomProperty(filters)]
	}
	function getKeyByValue(object, value) {

	  return Object.keys(object).find(key => object[key] === value);
	}

	//Stolen somewhere
	function createWhiteNoise(data,volume){
	  for (i = 0; i < data.length; i++) {
	    data[i] = (Math.random() - 0.5) * 2*volume;
	  }
	  return data
	}
	function createPinkNoise(data,volume){
	  let b0, b1, b2, b3, b4, b5, b6;
	      b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
	  for (let i = 0; i < data.length; i++) {
	        let white = Math.random() * 2 - 1;
	        b0 = 0.99886 * b0 + white * 0.0555179;
	        b1 = 0.99332 * b1 + white * 0.0750759;
	        b2 = 0.96900 * b2 + white * 0.1538520;
	        b3 = 0.86650 * b3 + white * 0.3104856;
	        b4 = 0.55000 * b4 + white * 0.5329522;
	        b5 = -0.7616 * b5 - white * 0.0168980;
	        data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
	        data[i] *= 0.11*volume; // (roughly) compensate for gain
	        b6 = white * 0.115926;
	    }
	    return data
	}
	function createBrownianNoise(data,volume){
	  let lastOut = 0.0;
	  for (let i = 0; i < data.length; i++) {
	        let white = Math.random() * 2 - 1;
	            data[i] = (lastOut + (0.02 * white)) / 1.02;
	            lastOut = data[i];
	            data[i] *= 3.5*volume; // (roughly) compensate for gain
	    }
	    return data
	}
	function noiseBuffer(context) {
	  let bufferSize = context.sampleRate;
	  let buffer = context.createBuffer(1, bufferSize, context.sampleRate);
	  let output = buffer.getChannelData(0);

	  for (let i = 0; i < bufferSize; i++) {
	    output[i] = Math.random() * 2 - 1;
	  }

	  return buffer;
	};
	//Seed generation related
	function b64EncodeUnicode(str) {
	    // first we use encodeURIComponent to get percent-encoded UTF-8,
	    // then we convert the percent encodings into raw bytes which
	    // can be fed into btoa.
	    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
	        function toSolidBytes(match, p1) {
	            return String.fromCharCode('0x' + p1);
	    }));
	}
	function b64DecodeUnicode(str) {
	    // Going backwards: from bytestream, to percent-encoding, to original string.
	    return decodeURIComponent(atob(str).split('').map(function(c) {
	        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
	    }).join(''));
	}
	function escapeRegExp(str) {

	  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
	}
	//custom replacements to minimize string length
	//based on symbols present in instr string
	//and typical recurring patterns
	let dictionary = 'pnmtxzvcqeiysrlLg%@#$^()_!`*/-ABCDEFGHIJKMNOPQRSTUVWXXZ'.split('')
	let toReplace = ['],d:[',
					']},n:[',
					'],f:[{t:',
					'{t:',
					'},t',
					',f:',
					',v:',
					',c:',
					',q:',
					'],e:{a:',
					'},d:',
					',d:',
					',s:',
					',r:',
					',l:',
					',L:',
					',g:',
					'}]z[e',
					',0',
					',1',
					',2',
					',3',
					',4',
					',5',
					',6',
					',7',
					',8',
					',9',
					',-',
					'0.',
					'1.',
					'2.',
					'3.',
					'4.',
					'-0',
					'-1',
					'-2',
					'-3',
					'-4',
					'-5']
	let min = Math.min(dictionary.length,toReplace.length)
	function packJson(json){
		//remove all quotes
		let result = json.replace(/['"]+/g, '');
		//console.log(result)

		//first 7 chars are always the same
		result = result.substring(7);
		
		for(let i = 0;i<min;i++){
			var re = new RegExp(escapeRegExp(toReplace[i]) , "g");
			result = result.replace(re,dictionary[i])	
		}

		result = result.substring(0, result.length - 1);
		//console.log(result)
		unpackJson(result)
		
		return result
	}
	function unpackJson(json){
		result = '{o:{w:['+json;

		for(let i = 0;i<min;i++){
			var re = new RegExp(escapeRegExp(dictionary[min-1-i]), "g");
			result = result.replace(re,toReplace[min-1-i])	
		}

		result+='}'

		result = eval('('+result+')');
		return result
	}

	//helpers for getting a frequency in hz from a note name + octave 
	const rootNotes = {
	  'C': 261.626,
	  'C#':277.183,
	  'D':293.665,
	  'D#':311.127,
	  'E':329.628,
	  'F':349.228,
	  'F#':369.994,
	  'G':391.995,
	  'G#':415.305,
	  'A':440,
	  'A#':466.164,
	}
	function getFrequency(note){
	  let oct = note.slice(-1);
	  let rootNote = note.slice(0, -1);

	    return rootNotes[rootNote]*Math.pow(2,(oct-3));
	}
	//only display a 
	String.prototype.trunc = String.prototype.trunc ||
      function(n){
          return (this.length > n) ? this.substr(0, n-1) + '&hellip;' : this;
      };
})();


