# ATCart-momo

This is a script to communicate with Cube pilot by using dronekit API and to receive commands from momo/ayame WebRTC by user from the browser.

`AP_momo_test.py` is the main file.

You must run `sh 01_socat.sh` at first to open the /dev/pts/** port.

In order to make it functional, these script must be on the robot side, and three channels (2 of camera channels and one of data channel) of momo/ayame have to be running as well.

## Run
The process to run right now is pretty much manually, you will ned to run `sh 01_socat.sh` at first then memorize the second port.

Start 3 channels of momo/ayame, there should be momo executable file on the robot, download it from [here](https://github.com/shiguredo/momo/releases) 

Run `python3 AP_momo_test.py --port /dev/pts/<second generated port above from socat>`



