#!/bin/sh
cd /home/farbot/work/webrtc_sys/
./momo --use-native --no-audio-device --video-device /dev/video0 --resolution VGA --serial /dev/pts/0,9600 test
