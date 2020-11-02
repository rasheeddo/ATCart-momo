#!/bin/sh
sleep 5s
cd /home/smartagri/work/webrtc_sys/setup
sh 01_socat.sh &
sleep 5s
sh 02_momo.sh &
cd /home/smartagri/work/webrtc_sys
./debug

