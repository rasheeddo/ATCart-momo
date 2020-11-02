# ATCart-momo

This is a script to communicate with Cube pilot by using dronekit API and to receive commands from momo/ayame WebRTC by user.

`AP_momo_test.py` is the main file.

You must run `sh 01_socat.sh` at first to open the /dev/pts/** port.

In order to make it functional, this script must be on the robot side, and three channels (2 of camera channels and one of data channel) of momo/ayame have to be running as well.