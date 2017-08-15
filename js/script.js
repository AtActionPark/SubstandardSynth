"use strict";
//create a common context to be used by the synth, keyboard and visualizers
let context = new AudioContext;
let mixNode = context.createGain();
mixNode.gain.value = 1;
mixNode.connect(context.destination)
let keyborad,keyborad2
let basicSynth

function setUpKeyboard(name, source,div){
	name = new TolerableKeyboard({
            divID: div, 
            showKey:true, 
            autoSetUp:false, 
            firstNote:'C2'
       })

	name.pressNote = function(frequency){
		source.playNote(frequency,0)
	}
	name.releaseNote = function(frequency){
		source.stopNote(frequency,0)
	}
}

document.addEventListener('DOMContentLoaded', function(){ 
	//code highlight
    hljs.initHighlightingOnLoad()

	basicSynth = new SubstandardSynth({context:context})

	setUpKeyboard(keyborad,basicSynth,'keyboard');
}, false);

function createCustomSynth(){
	//New synth creation
	//All the options will fall back on default values if not provided
	let customSynth = new WebAudioSynth({
		context:context,
		outNode:mixNode,
		ID:'customSynth',
		voices:8,
		//the oscillator, noises, and filter can accept multiple objects
		//oscillator object: {wave: wave type, detune:freq in hz}
		defaultOscillators:[{wave: 'square', detune: 0},{wave: 'triangle', detune: 2}],
		//noise object: {type: noise type, filterType: filter type, cutoff:filter cutoff frequency, volume: noise volume}
		defaultNoises:[],
		//filter object:{type: filter type,frequency: filter cutoff frequency,q: quality factor}
		defaultFilters:[{type:'lowpass',frequency:3000,q:2}],
		//envelope parameters in second
		defaultEnvelope:{peakLevel:0.6,
						sustainLevel:0.2,
						attackTime:0.1,
						decayTime:0.1,
						releaseTime:0.1,
						//for sustain time, 10 codes for infinite sustain
						sustainTime:10},
		distortion:10,
		//show the synth panels
		display:true,
		//The size is in theory changeable, but most of the positions are hard coded
		// so big changes will mostly look bad
		height:400,
		width:750,
		topCaseSize:0,
		caseSize:20,
		outBorderSize:0,
		panelBorderSize:1,
		panelTitleHeight:20,
		panelBorderColor:'#FF4136',
		outBorderColor:'white',
		panelTextColor:'#FF4136',
		caseColor:'#FF4136',
		panelColor:'white',
		panelTitleColor:'black'
	});
	setUpKeyboard(keyborad2,customSynth,'keyborad2');
}




















