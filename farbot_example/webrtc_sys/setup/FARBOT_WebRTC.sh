#!/bin/sh
sleep 5s
cd /home/farbot/work/webrtc_sys/setup
echo "01_socat"
sh 01_socat.sh &
sleep 5s
echo "02_debug"
sh 02_debug.sh &
echo "03_momo_front"
sh 04_momo_side.sh &
echo "05_darknet_farbot"
sh 05_darknet_farbot.sh &
