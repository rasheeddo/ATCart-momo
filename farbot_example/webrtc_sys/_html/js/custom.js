const signalingUrl = 'ws://10.11.80.3:3000/signaling';
const options = Ayame.defaultOptions;
let roomId = null;
let clientId = null;
let videoCodec = null;
let audioCodec = null;
let signalingKey = null;
let dataChannel = null;
let conn =null;

let mediaRecorder;
let recordedBlobs;

function onChangeVideoCodec() {
  videoCodec = document.getElementById("video-codec").value;
  if (videoCodec == 'none') {
    videoCodec = null;
  }
}
// query string から roomId, clientId を取得するヘルパー
function parseQueryString() {
  const qs = window.Qs;
  if (window.location.search.length > 0) {
    var params = qs.parse(window.location.search.substr(1));
    if (params.roomId) {
      roomId = params.roomId;
    }
    if (params.clientId) {
      clientId = params.clientId;
    }
    if (params.signalingKey) {
      signalingKey = params.signalingKey;
    }
  }
}

parseQueryString();

const roomIdInput = document.getElementById("roomIdInput");
roomIdInput.addEventListener('change', (event) => {
  console.log(event);
  roomId = event.target.value;
});

window.onload = function(){
  const roomIdInput = document.getElementById("roomIdInput");

  roomIdInput.addEventListener('change', (event) => {
    console.log(event);
    roomId = event.target.value;
  });
  
  options.clientId = clientId ? clientId : options.clientId;
  if (signalingKey) {
    options.signalingKey = signalingKey;
  }

  options.video.direction = 'recvonly';
  options.audio.direction = 'recvonly';
  options.iceServers.urls = 'stun:10.11.80.3:3478';

  document.querySelector("#roomIdInput").value = roomId;
  document.querySelector("#clientIdInput").value = options.clientId;
}

async function startConn() {
  const hasEchoCancellation = document.querySelector('#echoCancellation').checked;
  options.video.codec = videoCodec;
  conn = Ayame.connection(signalingUrl, roomId, options, true);
  conn.on('open', async (e) => {
    dataChannel = await conn.createDataChannel('dataChannel');
    if (dataChannel) {
      dataChannel.onmessage = onMessage;
    }
  });
  conn.on('datachannel', (channel) => {
    if (!dataChannel) {
      dataChannel = channel;
      dataChannel.onmessage = onMessage;
    }
  });
  conn.on('disconnect', (e) => {
    console.log(e);
    dataChannel = null;
  });
  await conn.connect(null);
  conn.on('open', ({authzMetadata}) => console.log(authzMetadata));
  conn.on('addstream', (e) => {
    document.querySelector('#remote-video').srcObject = e.stream;
    handleSuccess(e.stream);
  });
}

async function disconnect() {
  if (conn) {
    conn.disconnect();
  }
}

//========================================================
// Gamepad APIからgamepadのデータをedit_areaに書き込んでsendする
//========================================================

function sendData() {
  var data = document.querySelector('#edit_area').textContent;
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(data);
  }
}

function sendGamepadData(GamepadData) {
  //var info_panel = document.getElementById("info_panel");
  //var target = document.getElementById("output");
  var b = document.getElementById('sendData');
  let textData = GamepadData;
  if (textData.length == 0) {
    return;
  }
  document.getElementById('edit_area').textContent = textData;
  b.click();
  //info_panel.innerHTML = textData;
  return;
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


