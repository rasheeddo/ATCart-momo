#!/bin/sh
cd /home/farbot/work/webrtc_sys/
v4l2-ctl -d /dev/video0 --set-ctrl=exposure_auto=1
./momo --use-native --no-audio-device --video-device /dev/video0 --resolution 3840x2160 --serial /dev/pts/0,9600 test
