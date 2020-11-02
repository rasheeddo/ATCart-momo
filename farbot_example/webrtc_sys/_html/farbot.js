const remoteVideo = document.getElementById('remote_video');
const dataTextInput = document.getElementById('data_text');
remoteVideo.controls = true;
let peerConnection = null;
let dataChannel = null;
let candidates = [];
let hasReceivedSdp = false;
// iceServer を定義
const iceServers = [{ 'urls': 'stun:stun.l.google.com:19302' }];
// peer connection の 設定
const peerConnectionConfig = {
  'iceServers': iceServers
};


const isSSL = location.protocol === 'https:';
const wsProtocol = isSSL ? 'wss://' : 'ws://';
const wsUrl = wsProtocol + location.host + '/ws';
const ws = new WebSocket(wsUrl);
ws.onopen = onWsOpen.bind();
ws.onerror = onWsError.bind();
ws.onmessage = onWsMessage.bind();

function onWsError(error){
  console.error('ws onerror() ERROR:', error);
}

function onWsOpen(event) {
  console.log('ws open()');
}
function onWsMessage(event) {
  console.log('ws onmessage() data:', event.data);
  const message = JSON.parse(event.data);
  if (message.type === 'offer') {
    console.log('Received offer ...');
    const offer = new RTCSessionDescription(message);
    console.log('offer: ', offer);
    setOffer(offer);
  }
  else if (message.type === 'answer') {
    console.log('Received answer ...');
    const answer = new RTCSessionDescription(message);
    console.log('answer: ', answer);
    setAnswer(answer);
  }
  else if (message.type === 'candidate') {
    console.log('Received ICE candidate ...');
    const candidate = new RTCIceCandidate(message.ice);
    console.log('candidate: ', candidate);
    if (hasReceivedSdp) {
      addIceCandidate(candidate);
    } else {
      candidates.push(candidate);
    }
  }
  else if (message.type === 'close') {
    console.log('peer connection is closed ...');
  }
}

function connect() {
  console.group();
  if (!peerConnection) {
    console.log('make Offer');
    makeOffer();
  }
  else {
    console.warn('peer connection already exists.');
  }
  console.groupEnd();
}

function disconnect() {
  console.group();
  if (peerConnection) {
    if (peerConnection.iceConnectionState !== 'closed') {
      peerConnection.close();
      peerConnection = null;
      if (ws && ws.readyState === 1) {
        const message = JSON.stringify({ type: 'close' });
        ws.send(message);
      }
      console.log('sending close message');
      cleanupVideoElement(remoteVideo);
      return;
    }
  }
  console.log('peerConnection is closed.');
  console.groupEnd();
}

function drainCandidate() {
  hasReceivedSdp = true;
  candidates.forEach((candidate) => {
    addIceCandidate(candidate);
  });
  candidates = [];
}

function addIceCandidate(candidate) {
  if (peerConnection) {
    peerConnection.addIceCandidate(candidate);
  }
  else {
    console.error('PeerConnection does not exist!');
  }
}

function sendIceCandidate(candidate) {
  console.log('---sending ICE candidate ---');
  const message = JSON.stringify({ type: 'candidate', ice: candidate });
  console.log('sending candidate=' + message);
  ws.send(message);
}

function playVideo(element, stream) {
  element.srcObject = stream;
  handleSuccess(stream);
}

function prepareNewConnection() {
  const peer = new RTCPeerConnection(peerConnectionConfig);
  dataChannel = peer.createDataChannel("serial");
  if ('ontrack' in peer) {
    if (isSafari()) {
      let tracks = [];
      peer.ontrack = (event) => {
        console.log('-- peer.ontrack()');
        tracks.push(event.track)
        // safari で動作させるために、ontrack が発火するたびに MediaStream を作成する
        let mediaStream = new MediaStream(tracks);
        playVideo(remoteVideo, mediaStream);
      };
    }
    else {
      let mediaStream = new MediaStream();
      playVideo(remoteVideo, mediaStream);
      peer.ontrack = (event) => {
        console.log('-- peer.ontrack()');
        mediaStream.addTrack(event.track);
      };
    }
  }
  else {
    peer.onaddstream = (event) => {
      console.log('-- peer.onaddstream()');
      playVideo(remoteVideo, event.stream);
    };
  }

  peer.onicecandidate = (event) => {
    console.log('-- peer.onicecandidate()');
    if (event.candidate) {
      console.log(event.candidate);
      sendIceCandidate(event.candidate);
    } else {
      console.log('empty ice event');
    }
  };

  peer.oniceconnectionstatechange = () => {
    console.log('-- peer.oniceconnectionstatechange()');
    console.log('ICE connection Status has changed to ' + peer.iceConnectionState);
    switch (peer.iceConnectionState) {
      case 'closed':
      case 'failed':
      case 'disconnected':
        break;
    }
  };
  peer.addTransceiver('video', {direction: 'recvonly'});
  peer.addTransceiver('audio', {direction: 'recvonly'});

  dataChannel.onmessage = function (event) {
    console.log("Got Data Channel Message:", new TextDecoder().decode(event.data));
  };
  
  return peer;
}

function browser() {
  const ua = window.navigator.userAgent.toLocaleLowerCase();
  if (ua.indexOf('edge') !== -1) {
    return 'edge';
  }
  else if (ua.indexOf('chrome')  !== -1 && ua.indexOf('edge') === -1) {
    return 'chrome';
  }
  else if (ua.indexOf('safari')  !== -1 && ua.indexOf('chrome') === -1) {
    return 'safari';
  }
  else if (ua.indexOf('opera')   !== -1) {
    return 'opera';
  }
  else if (ua.indexOf('firefox') !== -1) {
    return 'firefox';
  }
  return ;
}

function isSafari() {
  return browser() === 'safari';
}

function sendSdp(sessionDescription) {
  console.log('---sending sdp ---');
  const message = JSON.stringify(sessionDescription);
  console.log('sending SDP=' + message);
  ws.send(message);
}

async function makeOffer() {
  peerConnection = prepareNewConnection();
  try {
    const sessionDescription = await peerConnection.createOffer({
      'offerToReceiveAudio': true,
      'offerToReceiveVideo': true
    })
    console.log('createOffer() success in promise, SDP=', sessionDescription.sdp);
    switch (document.getElementById('codec').value) {
      case 'H264':
        sessionDescription.sdp = removeCodec(sessionDescription.sdp, 'VP8');
        sessionDescription.sdp = removeCodec(sessionDescription.sdp, 'VP9');
        break;
      case 'VP8':
        sessionDescription.sdp = removeCodec(sessionDescription.sdp, 'H264');
        sessionDescription.sdp = removeCodec(sessionDescription.sdp, 'VP9');
        break;
      case 'VP9':
        sessionDescription.sdp = removeCodec(sessionDescription.sdp, 'H264');
        sessionDescription.sdp = removeCodec(sessionDescription.sdp, 'VP8');
        break;
    }
    await peerConnection.setLocalDescription(sessionDescription);
    console.log('setLocalDescription() success in promise');
    sendSdp(peerConnection.localDescription);
  } catch (error) {
    console.error('makeOffer() ERROR:', error);
  }
}

async function makeAnswer() {
  console.log('sending Answer. Creating remote session description...');
  if (!peerConnection) {
    console.error('peerConnection DOES NOT exist!');
    return;
  }
  try {
    const sessionDescription = await peerConnection.createAnswer();
    console.log('createAnswer() success in promise');
    await peerConnection.setLocalDescription(sessionDescription);
    console.log('setLocalDescription() success in promise');
    sendSdp(peerConnection.localDescription);
    drainCandidate();
  } catch (error) {
    console.error('makeAnswer() ERROR:', error);
  }
}

// offer sdp を生成する
function setOffer(sessionDescription) {
  if (peerConnection) {
    console.error('peerConnection already exists!');
  }
  const peerConnection = prepareNewConnection();
  peerConnection.onnegotiationneeded = async function () {
    try{
      await peerConnection.setRemoteDescription(sessionDescription);
      console.log('setRemoteDescription(offer) success in promise');
      makeAnswer();
    }catch(error) {
      console.error('setRemoteDescription(offer) ERROR: ', error);
    }
  }
}

async function setAnswer(sessionDescription) {
  if (!peerConnection) {
    console.error('peerConnection DOES NOT exist!');
    return;
  }
  try {
    await peerConnection.setRemoteDescription(sessionDescription);
    console.log('setRemoteDescription(answer) success in promise');
    drainCandidate();
  } catch(error) {
    console.error('setRemoteDescription(answer) ERROR: ', error);
  }
}

function cleanupVideoElement(element) {
  element.pause();
  element.srcObject = null;
}


/* getOffer() function is currently unused.
function getOffer() {
  initiator = false;
  createPeerConnection();
  sendXHR(
    ".GetOffer",
    JSON.stringify(peer_connection.localDescription),
    function (respnse) {
      peer_connection.setRemoteDescription(
        new RTCSessionDescription(respnse),
        function () {
          peer_connection.createAnswer(
            function (answer) {
              peer_connection.setLocalDescription(answer);
            }, function (e) { });
        }, function (e) {
          console.error(e);
        });
    }, true);
}
*/

// Stack Overflow より引用: https://stackoverflow.com/a/52760103
// https://stackoverflow.com/questions/52738290/how-to-remove-video-codecs-in-webrtc-sdp
function removeCodec(orgsdp, codec) {
  const internalFunc = (sdp) => {
    const codecre = new RegExp('(a=rtpmap:(\\d*) ' + codec + '\/90000\\r\\n)');
    const rtpmaps = sdp.match(codecre);
    if (rtpmaps == null || rtpmaps.length <= 2) {
      return sdp;
    }
    const rtpmap = rtpmaps[2];
    let modsdp = sdp.replace(codecre, "");

    const rtcpre = new RegExp('(a=rtcp-fb:' + rtpmap + '.*\r\n)', 'g');
    modsdp = modsdp.replace(rtcpre, "");

    const fmtpre = new RegExp('(a=fmtp:' + rtpmap + '.*\r\n)', 'g');
    modsdp = modsdp.replace(fmtpre, "");

    const aptpre = new RegExp('(a=fmtp:(\\d*) apt=' + rtpmap + '\\r\\n)');
    const aptmaps = modsdp.match(aptpre);
    let fmtpmap = "";
    if (aptmaps != null && aptmaps.length >= 3) {
      fmtpmap = aptmaps[2];
      modsdp = modsdp.replace(aptpre, "");

      const rtppre = new RegExp('(a=rtpmap:' + fmtpmap + '.*\r\n)', 'g');
      modsdp = modsdp.replace(rtppre, "");
    }

    let videore = /(m=video.*\r\n)/;
    const videolines = modsdp.match(videore);
    if (videolines != null) {
      //If many m=video are found in SDP, this program doesn't work.
      let videoline = videolines[0].substring(0, videolines[0].length - 2);
      const videoelems = videoline.split(" ");
      let modvideoline = videoelems[0];
      videoelems.forEach((videoelem, index) => {
        if (index === 0) return;
        if (videoelem == rtpmap || videoelem == fmtpmap) {
          return;
        }
        modvideoline += " " + videoelem;
      })
      modvideoline += "\r\n";
      modsdp = modsdp.replace(videore, modvideoline);
    }
    return internalFunc(modsdp);
  }
  return internalFunc(orgsdp);
}

function play() {
  remoteVideo.play();
}

function sendDataChannel() {
  let textData = dataTextInput.value;
  if (textData.length == 0) {
    return;
  }
  if (dataChannel == null || dataChannel.readyState != "open") {
    return;
  }
  dataChannel.send(new TextEncoder().encode(textData));
  dataTextInput.value = "";
}

function sendGamepadData(GamepadData) {
  let textData = GamepadData;
  if (textData.length == 0) {
    return;
  }
  if (dataChannel == null || dataChannel.readyState != "open") {
    return;
  }
  dataChannel.send(new TextEncoder().encode(textData));
}

/*
 * Gamepad API demonstration ECMAScript by DigiSapo
 *
 * Copyright (c) 2018 DigiSapo(http://www.plaza14.biz/sitio_digisapo/)
 * This software is released under the MIT License:
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

//========================================================
// JoystickPanel implementation
//========================================================

var JoystickPanel = {
	numConnected: 0,
	selectedGamepadUID: null,
	graphicalMode: true,
	graphicalModeAuto: true,
	configAxes: [],
	axesCheck: null,
	updateTimerMilliSec: 1000/30,
	updateTimerId: null,
	gamepadsList: null,
	axesMapperSelect: 0,
	axesMapper: [
		null,
		{	query:/CH COMBATSTICK/i,
			axesMapping:[
				{style:"auto"},
				{style:"throttle", dir:1},
				{style:"hat", dir:1}
			]
		},
		{	query:/Flight|Throttle(?:.*)Quadrant/i,
			axesMapping:[
				{style:"throttle", dir:1},
				{style:"throttle", dir:1},
				{style:"throttle", dir:1}
			]
		},
		{	query:/CH PRO PEDALS/i,
			axesMapping:[
				{style:"throttle", dir:1},
				{style:"throttle", dir:1},
				{style:"yaw", dir:1}
			]
		},
		{	query:/Sidewinder(?:.*)Joystick/i,
			axesMapping:[
				{style:"auto"},
				{style:"yaw", dir:1},
				{style:"throttle", dir:1},
				{style:"hat", dir:-1}
			]
		}
	]
};

JoystickPanel.buildInterface = function(){
	var info_panel = document.getElementById("info_panel");
	if (!navigator.getGamepads) {
		info_panel.innerHTML = "<h3>Gamepad API 未対応ブラウザです<h3>";
		return;
	}
	info_panel.style.color = "black";
	if (!this.gamepadsList || this.gamepadsList.length == 0) {
		info_panel.innerHTML = "Gamepad が接続されていません";
		return;
	}
	if (!this.selectedGamepadUID) {
		info_panel.innerHTML = "Gamepad未選択";
		return;
	}
	var gamepad = this.getSelectedGamepadData();
	if (!gamepad || !gamepad.connected) {
		info_panel.innerHTML = "接続されていません";
		return;
	}
	if (this.graphicalMode) {
		// graphical display mode
		//
		var result = "";
		this.configAxes = [];
		var gamepad = this.getSelectedGamepadData();

		var axes_map = this.axesMapper[this.axesMapperSelect];
		var axes_map_index = 0;

		//
		// Building button block...
		//
		if (gamepad.buttons && gamepad.buttons.length > 0) {
			//result = '<div class="button_block"><div class="block_header">- Buttons -</div>';
			result = '<ul class="buttons">'
			var num_buttons = gamepad.buttons.length;
			var i;
			for (i = 0; i < num_buttons; i++) {
				result += '<div class="button_box" id="btn_'+i+'">'+buttonNames[i]+'</div>';
			}
			result += '</div></ul>';
		} else {
			// NO BUTTONS
			result = '<div class="button_block"><div class="block_header">NO BUTTONS.</div></div>'
		}
		//
		// Building axes blocks...
		//
		if (gamepad.axes && gamepad.axes.length > 0) {
			var num_axes = gamepad.axes.length;
			var i;
			this.checkNewAxesMove(gamepad);
			var num_axes_blocks = 0;
			// result += '<div class="block_header">- Axes -</div>';
			i = 0;
			while (i < num_axes) {
				var if_style = "auto";
				var pair_idx, dir = 1;
				if (this.graphicalModeAuto) {
					if (axes_map && axes_map_index < axes_map.axesMapping.length) {
						if_style = axes_map.axesMapping[axes_map_index].style;
						if (if_style == "hat") {
							dir = axes_map.axesMapping[axes_map_index].dir;
						}
					}
				} else {
					if_style = "yaw";
				}
				if (if_style == "auto") {
					if (this.axesCheck[i].customStyle) {
						if_style = "hat";
					} else if (i+1 < num_axes) {
						if (!this.axesCheck[i+1].show || this.axesCheck[i+1].customStyle) {
							if_style = "throttle";
						} else {
							if_style = "xy-stick";
							pair_idx = i+1;
						}
					} else {
						if_style = "throttle";
					}
				}
				if (if_style == "xy-stick" && ( this.axesCheck[i].show || this.axesCheck[pair_idx].show )) {
					// X-Y axes pair style
					//
					this.configAxes.push({type:'X'   , index:i       , n:i, f:'5+x*5'});
					this.configAxes.push({type:'Y'   , index:pair_idx, n:i, f:'5+y*5'});
					this.configAxes.push({type:'Text', index:i       , n:i, f:'"#'+i+' =&ensp;"+axis_value_2_str(x,8,5)+"<br/>#'+pair_idx+' =&ensp;"+axis_value_2_str(y,8,5)'});
					result += "<div class=\"axis_block\">"
						+"	<div class=\"axis_xy\">"
						+"		<div class=\"axis_xy cross_line\"></div>"
						+"		<div class=\"axis_xy knob\" id=\"xy_knob_"+i+"\"></div>"
						+"	</div>"
						+"	<div class=\"axis_value\" id=\"axis_value_"+i+"\"></div>"
						+"</div>";
					i++;
					axes_map_index++;
					num_axes_blocks++;
				} else if (if_style == "hat" && this.axesCheck[i].show) {
					// Hat-sw axes style
					this.configAxes.push({type:'Hat' , index:i       , n:i, f:'Math.floor(0.5+((hat+1)*7)/2)*(Math.PI/4)'});
					this.configAxes.push({type:'Text', index:i       , n:i, f:'"#'+i+' =&ensp;"+axis_value_2_str(hat,8,5)'});
					result += "<div class=\"axis_block\">"
						+"	<div class=\"axis_hat\">"
						+"		<div class=\"axis_hat knob\" id=\"hat_knob_"+i+"\"></div>"
						+"	</div>"
						+"	<div class=\"axis_value\" id=\"axis_value_"+i+"\"></div>"
						+"</div>";
					axes_map_index++;
					num_axes_blocks++;
				} else if (if_style == "throttle" && this.axesCheck[i].show) {
					// Throttle axes style
					//
					this.configAxes.push({type:'Thr' , index:i       , n:i, f:'5+thr*5'});
					this.configAxes.push({type:'Text', index:i       , n:i, f:'"#'+i+' =<br/>&ensp;"+axis_value_2_str(thr,8,5)'});
					result += "<div class=\"axis_block\">"
						+"	<div class=\"axis_throttle\">"
						+"		<div class=\"axis_throttle knob\" id=\"thr_knob_"+i+"\"></div>"
						+"	</div>"
						+"	<div class=\"axis_value border_left\" id=\"axis_value_"+i+"\"></div>"
						+"</div>";
					axes_map_index++;
					num_axes_blocks++;
				} else if (this.axesCheck[i].show) {
					// Horizontal axes style
					//
					this.configAxes.push({type:'Yaw' , index:i       , n:i, f:'5+yaw*5'});
					this.configAxes.push({type:'Text', index:i       , n:i, f:'"#'+i+' =&ensp;"+axis_value_2_str(yaw,8,5)'});
					result += "<div class=\"axis_block_no_inline\">"
						+"	<div class=\"axis_rudder\">"
						+"		<div class=\"axis_rudder center_line\"></div>"
						+"		<div class=\"axis_rudder knob\" id=\"rud_knob_"+i+"\"></div>"
						+"	</div>"
						+"		<div class=\"axis_value\" id=\"axis_value_"+i+"\"></div>"
						+"</div>";
					axes_map_index++;
					num_axes_blocks++;
				}
				i++;
			}
			if (num_axes_blocks == 0) {
				result += "アナログ軸を表示するには、軸を操作してください";
			}
		} else {
			// NO AXES
			result += "NO AXES";
		}
		info_panel.innerHTML = result;
	} else {
		// raw data text mode
		//
		info_panel.innerHTML = "";
	}
};

JoystickPanel.displayModeChange = function(mode){
	if (mode == "graphic_auto") {
		JoystickPanel.graphicalMode = true;
		JoystickPanel.graphicalModeAuto = true;
	} else if (mode == "graphic_horizontal") {
		JoystickPanel.graphicalMode = true;
		JoystickPanel.graphicalModeAuto = false;
	} else {
		JoystickPanel.graphicalMode = false;
	}
	this.buildInterface();
};

JoystickPanel.selectGamepad = function(gamepad_uuid){
	this.selectedGamepadUID = gamepad_uuid;
	this.axesMapperSelect = 0;
	var num = this.axesMapper.length;
	var i
	for (i = 1; i < num; i++) {
		if (this.axesMapper[i].query.test(gamepad_uuid)) {
			this.axesMapperSelect = i;
			break;
		}
	}
	this.axesCheck = null;
	this.buildInterface();
	return ( this.selectedGamepadUID ? true : false );
};

JoystickPanel.getSelectedGamepadData = function(){
	var result = null;
	var num = this.gamepadsList.length;
	var i;
	for (i = 0; i < num; i++) {
		var tmp = this.gamepadsList[i]
		if (tmp && tmp.index != undefined && tmp.index+tmp.id == this.selectedGamepadUID) {
			result = tmp;
			break;
		}
	}
	return result;
};

JoystickPanel.checkNewAxesMove = function(gamepad){
	var result = 0;
	if (gamepad.axes && gamepad.axes.length > 0) {
		var i;
		var num_axes = gamepad.axes.length;
		if (this.axesCheck && this.axesCheck.length == num_axes) {
			for (i = 0; i < num_axes; i++) {
				var v = this.axesCheck[i].value;
				if (v != gamepad.axes[i]) {
					if (!this.axesCheck[i].show) {
						result++;
						this.axesCheck[i].show = true;
					}
				}
				if (this.axesCheck[i].show && (v < -1.01 || v > 1.01)) {
					if (!this.axesCheck[i].customStyle) {
						result++;
						this.axesCheck[i].customStyle = true;
					}
				}
			}
		} else {
			this.axesCheck = new Array(num_axes);
			for (i = 0; i < num_axes; i++) {
				this.axesCheck[i] = {show:false, value:gamepad.axes[i], customStyle:false};
			}
		}
	}
	return result;
}

var previos_data = "";
JoystickPanel.updateGamepadData = function(){

	if (!navigator.getGamepads) return;
	this.gamepadsList = navigator.getGamepads();
	var gamepad = this.getSelectedGamepadData();

	if (!gamepad || !gamepad.connected) {
		// disconnected
		//
		return;
	}
	if (this.checkNewAxesMove(gamepad)) this.buildInterface();
	if (this.graphicalMode) {
		// graphical display mode
		//
		
		// Variables to be used in reflection functions of axis-configurator.
		var i, x, y, thr, yaw, hat;
		
		var num_axes = this.configAxes.length;
		if (num_axes > 0) {
			for (i = 0; i < num_axes; i++) {
				a_cnf = this.configAxes[i];
				if (a_cnf.type == 'X') {
					x = gamepad.axes[a_cnf.index];
					var knob = document.getElementById("xy_knob_"+a_cnf.n);
					knob.style.left = eval(a_cnf.f)+"rem";
				} else if (a_cnf.type == 'Y') {
					y = gamepad.axes[a_cnf.index];
					knob.style.top = eval(a_cnf.f)+"rem";
				} else if (a_cnf.type == 'Thr') {
					thr = gamepad.axes[a_cnf.index];
					knob = document.getElementById("thr_knob_"+a_cnf.n);
					knob.style.top = eval(a_cnf.f)+"rem";
				} else if (a_cnf.type == 'Yaw') {
					yaw = gamepad.axes[a_cnf.index];
					knob = document.getElementById("rud_knob_"+a_cnf.n);
					knob.style.left = eval(a_cnf.f)+"rem";
				} else if (a_cnf.type == 'Hat') {
					hat = gamepad.axes[a_cnf.index];
					knob = document.getElementById("hat_knob_"+a_cnf.n);
					var a = eval(a_cnf.f);
					var hat_x = 3, hat_y = 3;
					if (a >= 0 && a < 2*Math.PI) {
						hat_x = (3+3*Math.sin(a));
						hat_y = (3-3*Math.cos(a));
					}
					knob.style.left = hat_x+"rem";
					knob.style.top = hat_y+"rem";
				} else if (a_cnf.type == 'Text') {
					var xy_value = document.getElementById("axis_value_"+a_cnf.n);
					xy_value.innerHTML = eval(a_cnf.f);
				}
			}
		}
		
		if (gamepad.buttons && gamepad.buttons.length > 0) {
			var num_buttons = gamepad.buttons.length;
			var i;
			for (i = 0; i < num_buttons; i++) {
				var col = "white";
				if (gamepad.buttons[i].pressed) {
					col = [0xFF,0x60,0x60];
					var pressure = 1.0;
					if (gamepad.buttons[i].value != 0) {
						pressure = gamepad.buttons[i].value;
					}
					col = "#"+col.map(function(x){return("0"+Math.round(pressure*x).toString(16)).slice(-2);}).join("");
				}
				var button_box = document.getElementById("btn_"+i);
				button_box.style.backgroundColor = col;
			}
		}
		
	} else {
		// raw data text mode
		//
		var info_panel = document.getElementById("info_panel");
		//var result = "<div style=\"width:100%; padding: 0.2em; background-color: #eee;\">id: '<strong>" + gamepad.id + "</strong>'</div>";
		var result = "{\"ID\":\""+ gamepad.id + "\",";
		result += "\"TIMESTAMP\":"+ Math.round(gamepad.timestamp*100)/100 + ",";
		result += "\"INDEX\":"+gamepad.index+",";
		result += "\"MAPPING\":\"" + gamepad.mapping + "\",";

		var gamepad_data = "{\"TIME\":"+ Math.round(gamepad.timestamp*100)/100 + ",";
                //var gamepad_data = "{\"TIME\":"+ gamepad.timestamp + ",";

		if (gamepad.axes && gamepad.axes.length > 0) {
			var num_axes = gamepad.axes.length;
			var i;
			result += "\"AXES\":{";
			gamepad_data += "\"AXES\":{";
			for (i = 0; i < num_axes; i++) {
				if( i < num_axes - 1 ) {
					result += "\"#" + ('00'+i).slice(-2) + "\":" + Math.round(gamepad.axes[i]*100)/100 + ",";
					gamepad_data += "\"#" + ('00'+i).slice(-2) + "\":" + Math.round(gamepad.axes[i]*100)/100 + ",";
				}
				else {
					result += "\"#" + ('00'+i).slice(-2) + "\":" + Math.round(gamepad.axes[i]*100)/100;
					gamepad_data += "\"#" + ('00'+i).slice(-2) + "\":" + Math.round(gamepad.axes[i]*100)/100;
				}
			}
			result += "},";
			gamepad_data += "},";
		} else {
			result += "\"AXES\":{},";
			gamepad_data += "\"AXES\":{},";
		}
		if (gamepad.buttons && gamepad.buttons.length > 0) {
			var num_buttons = gamepad.buttons.length;
			var i;
                        var button_value;
			result += "\"BUTTON\":{";
			gamepad_data += "\"BUTTON\":{";
			for (i = 0; i < num_buttons; i++) {
				result += "\"#" + ('00'+i).slice(-2) + "\":";
				gamepad_data += "\"#" + ('00'+i).slice(-2) + "\":";
				//result += ( gamepad.buttons[i].pressed ? "\"on\"," : "\"off\",");
				button_value = Math.round(gamepad.buttons[i].value);
				if( i < num_buttons - 1 ){
					result += Math.round(gamepad.buttons[i].value*100)/100 + ",";
					gamepad_data += Math.round(gamepad.buttons[i].value*100)/100 + ",";
				}else{
					result += Math.round(gamepad.buttons[i].value*100)/100;
					gamepad_data += Math.round(gamepad.buttons[i].value*100)/100;
				}
			}
			result += "},";
			result += "\"TOTAL AXES\":" + num_axes +",";
			result += "\"TOTAL BUTTONS\":" + num_buttons;
			result += "}";
			gamepad_data += "}}\n";
			//if ( Objects.equals(gamepad_data,previos_data) ){
			//var aJSON = JSON.stringify(gamepad_data);
			//var bJSON = JSON.stringify(previos_data);
			//if ( aJSON != bJSON ){
			//if ( JSON.stringify(gamepad_data) != JSON.stringify(previos_data) ){
			sendGamepadData(gamepad_data);
			//	previos_data = gamepad_data;
                        //        //sleep(100);
			//}
		} else {
			result = result + "NO BUTTONS.<br/><br/>";
		}
		info_panel.innerHTML = result;
	}
};

JoystickPanel.init = function(){
	if (navigator.getGamepads) {
		console.log("Gamepad API 対応");
		this.gamepadsList = navigator.getGamepads();
	}
	this.axesCheck = null;
	this.buildInterface();
};


JoystickPanel.updateTimerCallback = function(){
	JoystickPanel.updateGamepadData();
	JoystickPanel.updateTimerId = setTimeout(JoystickPanel.updateTimerCallback, JoystickPanel.updateTimerMilliSec);
};
JoystickPanel.updateTimerStart = function() {
	JoystickPanel.updateTimerStop();
	JoystickPanel.updateTimerCallback();
};

JoystickPanel.updateTimerStop = function(){
	clearTimeout(JoystickPanel.updateTimerId); JoystickPanel.updateTimerId = null;
};

// Global function(s)
//
//

function axis_value_2_str(v,dig,dig_frac){
	return (Array(dig+1).join(' ')+v.toFixed(dig_frac)).slice(-dig);
}

/*
 * Gamepad をセレクターから選択した場合のイベント
 */
var gamepad_selector_change = function(){
	JoystickPanel.updateTimerStop();
	var gamepad_selector = document.getElementById("gamepad_selector");
	var gamepad_uuid = gamepad_selector.options[gamepad_selector.selectedIndex].value;
	if (JoystickPanel.selectGamepad(gamepad_uuid)) {
		JoystickPanel.updateTimerStart();
	}
};
/*
 * Gamepad オブジェクトと一致するセレクターのアイテムを検索
 */
var gamepad_selector_find = function(gamepad){
	if (!JoystickPanel.gamepadsList || !gamepad) return;
	var result = null;
	var gamepad_uuid = gamepad.index+gamepad.id;
	var gamepad_selector = document.getElementById("gamepad_selector");
	var num = gamepad_selector.options.length;
	var i;
	for (i = 1; i < num; i++) {
		if (gamepad_selector.options[i].value == gamepad_uuid) {
			result = i;
			break;
		}
	}
	return result ? gamepad_uuid : null;
};

/*
 * 表示モードをセレクターから変更した場合のイベント
 */
var display_mode_change = function(){
	var mode_selector = document.getElementById("mode_selector");
	var mode = mode_selector.options[mode_selector.selectedIndex].value;
	JoystickPanel.displayModeChange(mode);
};

/*
 * ローディング時の初期化処理
 */

(function (){

	JoystickPanel.init();

	/* 初期の表示モードを設定 */
	var mode_selector = document.getElementById("mode_selector");
	var mode = mode_selector.options[mode_selector.selectedIndex].value;
	JoystickPanel.displayModeChange(mode);

	/* Gamepad 接続時のイベント */
	window.addEventListener("gamepadconnected",function(e){
		var gamepad = e.gamepad;
		JoystickPanel.numConnected++;
		var gamepad_uuid = gamepad_selector_find(gamepad);
		if (gamepad_uuid) {
			/* ゲームパッドが再接続された場合 */
			console.log("gamepad connected... index="+gamepad.index+", id='"+gamepad.id+"'");
			JoystickPanel.selectGamepad(gamepad_uuid);
		} else {
			/* 新しいゲームパッドが接続された場合 */
			console.log("new gamepad connected... index="+gamepad.index+", id='"+gamepad.id+"'");
			var gamepad_selector = document.getElementById("gamepad_selector");
			var newGamepadOpt = document.createElement("option");
			newGamepadOpt.value = gamepad.index != undefined ? gamepad.index+gamepad.id : gamepad.id;
			newGamepadOpt.text = "#"+gamepad.index+"."+gamepad.id;
			gamepad_selector.appendChild(newGamepadOpt);
			if (JoystickPanel.numConnected == 1) {
				JoystickPanel.gamepadsList = navigator.getGamepads();
				JoystickPanel.selectGamepad(gamepad.index+gamepad.id);
				JoystickPanel.updateTimerStart();
				newGamepadOpt.selected = true;
			}
		}
	});
	/* Gamepad 切断時のイベント */
	window.addEventListener("gamepaddisconnected",function(e){
		var gamepad = e.gamepad;
		JoystickPanel.numConnected--;
		console.log("new gamepad disconnected... index="+gamepad.index+", id='"+gamepad.id+"'");
		var info_panel = document.getElementById("info_panel");
		info_panel.style.color = "#bbb";
	});

})();

/*
 * PS4コントローラ
 */
var buttonNames = [
	"×", "○", "□", "△",
	"L1", "R1", "L2", "R2",
	"SH", "OP",
	"L3", "R3",
	"↑", "↓", "←", "→",
	"PS", "TP"
  ];

//引数にはミリ秒を指定します。（例：5秒の場合は5000）
function sleep(a){
  var dt1 = new Date().getTime();
  var dt2 = new Date().getTime();
  while (dt2 < dt1 + a){
    dt2 = new Date().getTime();
  }
  return;
}

const errorMsgElement = document.querySelector('span#errorMsg');
const recordedVideo = document.querySelector('video#recorded');
const recordButton = document.querySelector('button#record');
recordButton.addEventListener('click', () => {
  if (recordButton.textContent === 'Start Rec') {
    startRecording();
  } else {
    stopRecording();
    recordButton.textContent = 'Start Rec';
    playButton.disabled = false;
    downloadButton.disabled = false;
  }
});

const playButton = document.querySelector('button#play');
playButton.addEventListener('click', () => {
  const superBuffer = new Blob(recordedBlobs, {type: 'video/webm'});
  recordedVideo.src = null;
  recordedVideo.srcObject = null;
  recordedVideo.src = window.URL.createObjectURL(superBuffer);
  recordedVideo.controls = true;
  console.log('Play Media URL:', recordedVideo.src);
  recordedVideo.play();
});

const downloadButton = document.querySelector('button#download');
downloadButton.addEventListener('click', () => {
  const blob = new Blob(recordedBlobs, {type: 'video/webm'});
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = 'test.avi';
  document.body.appendChild(a);
  console.log('Media File URL:', a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
});

function handleDataAvailable(event) {
  console.log('handleDataAvailable', event);
  if (event.data && event.data.size > 0) {
    recordedBlobs.push(event.data);
  }
}

function startRecording() {
  let mediaStream;
  
  recordedBlobs = [];
  let options = {mimeType: 'video/webm;codecs=vp9'};
  if (!MediaRecorder.isTypeSupported(options.mimeType)) {
    console.error(`${options.mimeType} is not supported`);
    options = {mimeType: 'video/webm;codecs=vp8'};
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      console.error(`${options.mimeType} is not supported`);
      options = {mimeType: 'video/webm'};
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.error(`${options.mimeType} is not supported`);
        options = {mimeType: ''};
      }
    }
  }

  try {
    mediaRecorder = new MediaRecorder(window.stream);
  } catch (e) {
    console.error('Exception while creating MediaRecorder:', e);
    errorMsgElement.innerHTML = `Exception while creating MediaRecorder: ${JSON.stringify(e)}`;
    return;
  }

  console.log('Created MediaRecorder', mediaRecorder, 'with options', options);
  recordButton.textContent = 'Stop Rec';
  playButton.disabled = true;
  downloadButton.disabled = true;
  mediaRecorder.onstop = (event) => {
    console.log('Recorder stopped: ', event);
    console.log('Recorded Blobs: ', recordedBlobs);
  };
  mediaRecorder.ondataavailable = handleDataAvailable;
  mediaRecorder.start();
  console.log('MediaRecorder started', mediaRecorder);
}

function stopRecording() {
  mediaRecorder.stop();
}

function handleSuccess(stream) {
  recordButton.disabled = false;
  console.log('getUserMedia() got stream:', stream);
  window.stream = stream;
}
