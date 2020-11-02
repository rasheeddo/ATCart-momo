#!/bin/sh

FARBOT_HOME=/home/farbot/work/FARBOT
sleep 3

export PYTHONPATH="$PYTHONPATH:/usr/local/lib:$FARBOT_HOME/lib/python3.6/dist-packages"
cd $FARBOT_HOME

exec /usr/bin/env python3 darknet_farbot.py
