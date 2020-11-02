import sys
if sys.version_info[0] < 3:
    raise Exception("Must be using Python 3")

import json
import socket
import struct
import configparser
import time
import timeout_decorator
import select
import numpy as np
import transforms3d
import pygame
import os
import subprocess
import datetime
from retry import retry
from ImuPacket import ImuPacket
from ast import literal_eval
import datetime
from pyHS100 import SmartPlug, SmartBulb
from pprint import pformat as pf
from subprocess import check_output

while True:
    try:  
        ips = check_output(['ifconfig', 'eth0'])
        if 'broadcast' in str(ips):
            print("connected")
            break

        else:
            print("sleep")

    except:
        print("nothing")
        

# Initializing dummy video output
os.environ['SDL_VIDEODRIVER'] = 'dummy'

imu = ImuPacket()

ini_config = configparser.ConfigParser()
ini_config.read('FARBOT.ini')

section = 'moab'
MOAB_COMPUTER = str(ini_config.get(section, 'MOAB_COMPUTER'))
MOAB_PORT = int(ini_config.get(section, 'MOAB_PORT'))
#SBUS_PORT = int(ini_config.get(section, 'SBUS_PORT'))

section = 'machine'
MAX_CHASE_SPEED    = float(ini_config.get(section, 'MAX_CHASE_SPEED'))

section = 'lidar_port'
JETSON_IP = ini_config.get(section, 'JETSON_IP')
LIDAR_BUFFER_SIZE = int(ini_config.get(section, 'LIDAR_BUFFER_SIZE'))
LIDAR_PORT = int(ini_config.get(section, 'LIDAR_PORT'))

# This is the sbus udp port.
sbus_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sbus_sock.bind(("0.0.0.0", 0))

darknet_farbot_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
darknet_farbot_sock.bind(("192.168.8.26", 50000))

BNO055_RX_PORT = 27114
imu_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
imu_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
imu_sock.bind(("0.0.0.0", BNO055_RX_PORT))

lidar_data_sock = socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
lidar_data_sock.bind(("192.168.8.26", LIDAR_PORT))

#axes0:Lスティック左,右(-1 <= 0.00 >= +1)
#axes1:Lスティック上,下(-1 <= 0.00 >= +1)
#ニュートラルポジション帯
MAX_DEADBAND = 0.0
MIN_DEADBAND = 0.0
#スティックの最大値,最小値
MAX_STICK = 1
MIN_STICK = -1
'''while True:
    try:
        bt_device = check_output(["hcitool", "con"]).decode().split()[3]
        break
    except:
        print("Connect Controller")
        time.sleep(1)'''

def SendFloat(float1, float2):
    udpPacket = struct.pack('ff', float1, float2)
    sbus_sock.sendto(udpPacket, (MOAB_COMPUTER, MOAB_PORT))

def map(val, in_min, in_max, out_min, out_max):
    return (val - in_min) * (out_max - out_min) / (in_max - in_min) + out_min

def map2(val1, val2, in_min, in_max, out_min, out_max):
    return (val - in_min) * (out_max - out_min) / (in_max - in_min) + out_min

def Neutral_pos(axes):
    if (axes <= MAX_DEADBAND and axes >= MIN_DEADBAND):
        return True
    else:
        return False

def moter_rpm(axes0,axes1):
    MotorRPM_L = None
    MotorRPM_R = None

    #ニュートラルポジション
    if (Neutral_pos(axes0) and Neutral_pos(axes1)):
        MotorRPM_L = 0.0
        MotorRPM_R = 0.0
        return MotorRPM_L, MotorRPM_R
    #前後進
    elif(Neutral_pos(axes0)):
        MotorRPM_L = map(axes1, MIN_STICK, MAX_STICK, -MAX_CHASE_SPEED, MAX_CHASE_SPEED)
        MotorRPM_R = MotorRPM_L
        return MotorRPM_L, MotorRPM_R
    #旋回
    elif(Neutral_pos(axes1)):
        MotorRPM_L = map(axes0, MIN_STICK, MAX_STICK, -MAX_CHASE_SPEED/2, MAX_CHASE_SPEED/2)
        MotorRPM_R = -MotorRPM_L
        return MotorRPM_L, MotorRPM_R
    #カーブ
    else:
        if(axes0 >= MAX_DEADBAND and axes1 >= MAX_DEADBAND):
            SCALE_X = map(axes0, MAX_DEADBAND, MAX_STICK, 0, MAX_CHASE_SPEED/2)
            SCALE_Y = map(axes1, MAX_DEADBAND, MAX_STICK, 0, MAX_CHASE_SPEED)
            SCALE = map(axes0, MAX_DEADBAND, MAX_STICK, 1, -1/2)
            MotorRPM_L = abs(SCALE_Y - SCALE_X)
            MotorRPM_R = abs(SCALE_Y - SCALE_X) * SCALE

        elif(axes0 <= MIN_DEADBAND and axes1 >= MAX_DEADBAND):
            SCALE_X = map(axes0, MIN_DEADBAND, MIN_STICK, 0, MAX_CHASE_SPEED/2)
            SCALE_Y = map(axes1, MAX_DEADBAND, MAX_STICK, 0, MAX_CHASE_SPEED)
            SCALE = map(axes0, MIN_DEADBAND, MIN_STICK, 1, -1/2)
            MotorRPM_L = abs(SCALE_Y - SCALE_X) * SCALE
            MotorRPM_R = abs(SCALE_Y - SCALE_X)

        elif(axes0 >= MAX_DEADBAND and axes1 <= MIN_DEADBAND):
            SCALE_X = map(axes0, MAX_DEADBAND, MAX_STICK, 0, -MAX_CHASE_SPEED/2)
            SCALE_Y = map(axes1, MIN_DEADBAND, MIN_STICK, 0, -MAX_CHASE_SPEED)
            SCALE = map(axes0, MAX_DEADBAND, MAX_STICK, -1, 1/2)
            MotorRPM_L = SCALE_Y - SCALE_X
            MotorRPM_R = -1 * (SCALE_Y - SCALE_X) * SCALE

        elif(axes0 <= MIN_DEADBAND and axes1 <= MIN_DEADBAND):
            SCALE_X = map(axes0, MIN_DEADBAND, MIN_STICK, 0, -MAX_CHASE_SPEED/2)
            SCALE_Y = map(axes1, MIN_DEADBAND, MIN_STICK, 0, -MAX_CHASE_SPEED)
            SCALE = map(axes0, MIN_DEADBAND, MIN_STICK, -1, 1/2)
            MotorRPM_L = -1 * (SCALE_Y - SCALE_X) * SCALE
            MotorRPM_R = SCALE_Y - SCALE_X
        else:
            MotorRPM_L = 0.0
            MotorRPM_R = 0.0
        
    return MotorRPM_L, MotorRPM_R

def turn_180(turn_angle, direction, pkt):
    global turn
    global init_angle
    global target_angle
    global target_angle_half
    imu.parse(pkt)
    rot = transforms3d.quaternions.quat2mat([imu.qw, imu.qx, imu.qy, imu.qz])
    angleY = -np.arctan2(rot[1, 0], rot[0,0])
    print("Current Angle :" + str(angleY))
    print("Target Angle :" + str(target_angle))
    
    if direction == 'left':
        if turn == "no_turn":
            turn = "left_180_turn"
            init_angle = angleY
            target_angle = angleY - turn_angle
            target_angle_half = angleY - turn_angle/2
            print("Target Angle :" + str(target_angle))

        # print(target_angle)
        # print(angleY)
        # print(angleY > target_angle)
        # print(angleY < target_angle + 2 * np.pi)

        if ((angleY <= init_angle + 0.1) and (angleY > target_angle_half)) or (angleY > target_angle_half + 2 * np.pi):
            return 0, -10
        elif ((angleY <= init_angle + 0.1) and (angleY > target_angle)) or (angleY > target_angle + 2 * np.pi):
            return 10, 0
        else:
            turn = "no_turn"
            return 0, 0

    if direction == 'right':
        if turn == "no_turn":
            turn = "right_180_turn"
            init_angle = angleY
            target_angle = angleY + turn_angle
            target_angle_half = angleY + turn_angle/2
            print("Target Angle :" + str(target_angle))

        # print(angleY)
        if ((angleY >= init_angle - 0.1) and (angleY < target_angle_half)) or (angleY < target_angle_half - 2 * np.pi):
            return -10, 0
        if ((angleY >= init_angle - 0.1) and (angleY < target_angle)) or (angleY < target_angle - 2 * np.pi):
            return 0, 10
        else:
            turn = "no_turn"
            return 0, 0

def turn_90(turn_angle, direction, pkt):
    global turn
    global init_angle
    global target_angle
    imu.parse(pkt)
    rot = transforms3d.quaternions.quat2mat([imu.qw, imu.qx, imu.qy, imu.qz])
    angleY = -np.arctan2(rot[1, 0], rot[0,0])
    print("Current Angle :" + str(angleY))
    print("Target Angle :" + str(target_angle))
    
    if direction == 'left':
        if turn == "no_turn":
            turn = "left_turn"
            init_angle = angleY
            target_angle = angleY - turn_angle
            print("Target Angle :" + str(target_angle))

        # print(target_angle)
        # print(angleY)
        # print(angleY > target_angle)
        # print(angleY < target_angle + 2 * np.pi)
        if ((angleY <= init_angle + 0.1) and (angleY > target_angle)) or (angleY > target_angle + 2 * np.pi):
            return 0, -10
        else:
            turn = "no_turn"
            return 0, 0

    if direction == 'right':
        if turn == "no_turn":
            turn = "right_turn"
            init_angle = angleY
            target_angle = angleY + turn_angle
            print("Target Angle :" + str(target_angle))

        # print(angleY)
        if ((angleY >= init_angle - 0.1) and (angleY < target_angle)) or (angleY < target_angle - 2 * np.pi):
            return -10, 0
        else:
            turn = "no_turn"
            return 0, 0

def obstacle_detection(lidar_angle, lidar_dist):
    i = 0
    while i < len(lidar_dist) - 2:
        if lidar_dist[i] > 500 or lidar_dist[i] < 1:
            lidar_dist.pop(i)
            lidar_angle.pop(i)

        else:
            i += 1
    #print(lidar_angle)
    #print(lidar_dist)
    previous_angle = 0.0
    obstacle_left = False
    obstacle_right = False
    obstacle_front = False
    obstacle_direction = 'none'
    for angle_data in lidar_angle:
        if 45 < angle_data < 135:
            obstacle_front = True
            obstacle_direction = 'front'
        elif 135 < angle_data < 180:
            obstacle_right = True
            obstacle_direction = 'right'
        elif 0 < angle_data < 45:
            obstacle_left = True
            obstacle_direction = 'left'
    """i = 0
    while i < len(lidar_dist)-2:
        if lidar_dist[i] < 500 and lidar_dist[i] > 0:
            lidar_dist.pop(i)
            lidar_angle.pop(i)
        
        else:
            i += 1
    print(lidar_angle)
    previous_angle = 0.0
    obstacle_left = False
    obstacle_right = False
    obstacle_both = False
    obstacle_direction = 'none'
    for angle_data in lidar_angle:
        if angle_data - previous_angle > 20:
            angle_data_avg = (angle_data + previous_angle) / 2
            if 135 < angle_data_avg < 225:
                obstacle_both = True
                obstacle_direction = 'front'
            elif 225 < angle_data_avg < 300:
                obstacle_right = True
                obstacle_direction = 'right'
            elif 60 < angle_data_avg < 135:
                obstacle_left = True
                obstacle_direction = 'left'
        previous_angle = angle_data"""
    return (obstacle_left or obstacle_right or obstacle_front), obstacle_front, obstacle_right, obstacle_left



@retry(tries=5)
@timeout_decorator.timeout(0.1, timeout_exception = StopIteration, exception_message="socat time out")
def read_socat(term):
    read = term.readline().decode()
    return read

rpmRs, rpmLs = 0, 0
pkt = []
turn = "no_turn"
init_angle = 0
target_angle = 0
target_angle_half = 0


pygame.init()

# Three types of controls: axis, button, and hat
axis = {}
button = {}
hat = {}

# Assign initial data values
# Axes are initialized to 0.0
for i in range(6):
	axis[i] = 0.0
# Buttons are initialized to False
for i in range(14):
	button[i] = False
# Hats are initialized to 0
for i in range(1):
	hat[i] = (0, 0)


# Labels
AXIS_LEFT_STICK_X = 0
AXIS_LEFT_STICK_Y = 1
# AXIS_RIGHT_STICK_X = 2
# AXIS_RIGHT_STICK_Y = 5
# AXIS_R2 = 4
AXIS_L2 = 3

# BUTTON_SQUARE = 0
BUTTON_CROSS = 1
BUTTON_CIRCLE = 2
# BUTTON_TRIANGLE = 3
BUTTON_L1 = 4
BUTTON_R1 = 5
BUTTON_L2 = 6
# BUTTON_R2 = 7
# BUTTON_SHARE = 8
# BUTTON_OPTIONS = 9
BUTTON_LEFT_STICK = 10
# BUTTON_RIGHT_STICK = 11
# BUTTON_PS = 12
# BUTTON_PAD = 13


HAT_1 = 0

rpmL = 0.0
rpmR = 0.0
old_stop_button = 0
old_left_button = 0
old_right_button = 0

lidar_angle = []

lidar_dist = []
obs = [False, "none"]

uvlamp_off_button = False
uvlamp_on_button = False

while True:
    try:
        plug = SmartPlug("192.168.8.199")
        plug.turn_off()
        p_state = plug.state
        break

    except:
        print("connect plug")

front_button = 0
back_button = 0
left_button = 0
right_button = 0
auto_mode_button = 0
unsafe_mode_button = 0
first = True

try:
    with open("lampdata.json", 'r') as p:
        lamp_data = json.load(p)
        #print(lamp_data)
        totalhour = lamp_data["hours"]
        totalmin = lamp_data["minutes"]
        lamp_data["status"] = p_state
        json_dict1 = {"hours": totalhour, "minutes": totalmin, "status": p_state}
    with open("/home/smartagri/work/FARBOT/webrtc/py/lampdata.json", "w") as out_file:
        json.dump(json_dict1, out_file)

except:
    json_dict = {"hours": 0, "minutes": 0, "status": "OFF"}
    with open("lampdata.json", "w") as f_out_file:
        json.dump(json_dict, f_out_file)

p_state = plug.state


with open("/dev/pts/1", "rb", buffering=0) as term:
    str_buffer = ''
    rpmL = 0.0
    rpmR = 0.0
    old_stop_button = 0
    old_left_button = 0
    old_right_button = 0

    while True:

        # receive data from darknet_farbot for auto run
        try:
            while True:
                data, fromAddr = darknet_farbot_sock.recvfrom(1024, socket.MSG_DONTWAIT)
                rpmRs, rpmLs = data.decode().split("and")
        except:
            rpmRs, rpmLs = rpmRs, rpmLs
            # print('except1')

        # receive imu(gyro) data from moab board
        try:
            while True:
                pkt, fromAddr = imu_sock.recvfrom(128, socket.MSG_DONTWAIT)
                # print("got packet")
        except:
            pkt = pkt

        # str_buffer = read_socat(term)
        # dec = json.loads(str_buffer)
        # print(dec)
        
        gdata = False
        stick_l, stick_r = 0, 0
        try:
            p_state = plug.state
            print("P_STATE:" + str(p_state))
        except:
            print("no plug found")
        
        

        if os.path.exists("/dev/input/js0"):
            if first:
                pygame.joystick.init()
                controller = pygame.joystick.Joystick(0)
                controller.init()
                first = False
            try:
                bt_device = check_output(["hcitool", "con"]).decode().split()[3]
                rssi_signal = check_output(["hcitool", "rssi", bt_device]).decode().split()[3]
                if int(rssi_signal) <= -28:
                    # Axes are initialized to 0.0
                    for i in range(controller.get_numaxes()):
                        axis[i] = 0.0
                    # Buttons are initialized to False
                    for i in range(controller.get_numbuttons()):
                        button[i] = False
                    # Hats are initialized to 0
                    for i in range(controller.get_numhats()):
                        hat[i] = (0, 0)
                    front_button, back_button, left_button, right_button, auto_mode_button, x_stick, y_stick = 0, 0, 0, 0, 0, 0, 0
                    print("Bluetooth is about to disconnecttt")
                    SendFloat(0,0)
                else: 
                    # update the joystick data
                    for event in pygame.event.get():

                        if event.type == pygame.JOYAXISMOTION:
                            axis[event.axis] = round(event.value, 3)
                        elif event.type == pygame.JOYBUTTONDOWN:
                            button[event.button] = True
                        elif event.type == pygame.JOYBUTTONUP:
                            button[event.button] = False
                        elif event.type == pygame.JOYHATMOTION:
                            hat[event.hat] = event.value
            except:
                # Axes are initialized to 0.0
                for i in range(controller.get_numaxes()):
                    axis[i] = 0.0
                # Buttons are initialized to False
                for i in range(controller.get_numbuttons()):
                    button[i] = False
                # Hats are initialized to 0
                for i in range(controller.get_numhats()):
                    hat[i] = (0, 0)
                front_button, back_button, left_button, right_button, auto_mode_button, x_stick, y_stick = 0, 0, 0, 0, 0, 0, 0
                print("Bluetooth is about to disconnect")
                SendFloat(0,0)

            # assigning buttons
            unsafe_mode_button = button[BUTTON_R1]
            uvlamp_on_button = unsafe_mode_button and button[BUTTON_CIRCLE]
            uvlamp_off_button = button[BUTTON_CROSS]
            auto_mode_button = button[BUTTON_L1]
            if hat[HAT_1][1] > 0.5:
                front_button = 1
                back_button = 0
            elif hat[HAT_1][1] < -0.5:
                front_button = 0
                back_button = 1
            else:
                front_button = 0
                back_button = 0
            if hat[HAT_1][0] < -0.5:
                left_button = 1
                right_button = 0
            elif hat[HAT_1][0] > 0.5:
                left_button = 0
                right_button = 1
            else:
                left_button = 0
                right_button = 0

            stick_l = abs(axis[AXIS_LEFT_STICK_X]) * np.sign(axis[AXIS_LEFT_STICK_X])
            stick_r = abs(axis[AXIS_LEFT_STICK_Y]) * np.sign(axis[AXIS_LEFT_STICK_Y] * -1)

            print("BLUETOOTH DATA")
            print([auto_mode_button, front_button, back_button, left_button, right_button, stick_l,
                   stick_r])
            
            
        else:
            first = True
            try:

                str_buffer = read_socat(term)

                dec = json.loads(str_buffer)

                glist = dec
                gdata = True

                # if gdata:
                print(dec)
                auto_mode_button = dec['BUTTON']['#04']
                if auto_mode_button == 1:
                    auto_mode_button = True
                else:
                    auto_mode_button = False
                front_button = dec['BUTTON']['#12']
                back_button = dec['BUTTON']['#13']
                left_button = dec['BUTTON']['#14']
                right_button = dec['BUTTON']['#15']
                if dec['BUTTON']['#05'] == 1:
                    unsafe_mode_button = True
                else:
                    unsafe_mode_button = False

                if unsafe_mode_button and (dec['BUTTON']['#01'] == 1):
                    uvlamp_on_button = True
                else:
                    uvlamp_on_button = False
                if dec['BUTTON']['#00'] == 1:
                    uvlamp_off_button = True
                else:
                    uvlamp_off_button = False

                stick_l = abs(dec['AXES']['#00']) * np.sign(dec['AXES']['#00'])
                stick_r = abs(dec['AXES']['#01']) * np.sign(dec['AXES']['#01'] * -1)

                print("WEBRTC DATA")
                print([auto_mode_button, front_button, back_button, left_button, right_button, stick_l,
                       stick_r])
                first = True
            except:

                # if bluetooth controller is switched off, wait for it to connect again
                pygame.joystick.quit()

                print("Connect Controller")
                time.sleep(1)
        try:
            # input lidar data
            try:
                newestData = None
                keepReceiving = True
                while keepReceiving:
                    try:
                        data = lidar_data_sock.recv(4096, socket.MSG_DONTWAIT)
                        if data:
                            newestData = data
                    except socket.error as why:
                        if why.args[0] == 11:
                            keepReceiving = False
                        else:
                            raise why
                lidar_data_decoded = newestData.decode()
                lidar_angle.clear()
                lidar_dist.clear()
                while lidar_data_decoded == "hi" or len(lidar_data_decoded) > 3000:
                    lidar_data, addr = lidar_data_sock.recvfrom(LIDAR_BUFFER_SIZE)
                    lidar_data_decoded = lidar_data.decode()
                if lidar_data_decoded != "hi" and len(lidar_data_decoded) < 3000:
                    lidar_data_decoded = literal_eval(lidar_data_decoded)
                    lidar_angle.extend(lidar_data_decoded)
                    lidar_data, addr = lidar_data_sock.recvfrom(LIDAR_BUFFER_SIZE)
                    lidar_data_decoded = lidar_data.decode()
                    lidar_data_decoded = literal_eval(lidar_data_decoded)
                    lidar_dist.extend(lidar_data_decoded)
                    lidar_data, addr = lidar_data_sock.recvfrom(LIDAR_BUFFER_SIZE)
                    lidar_data_decoded = lidar_data.decode()
                obs = obstacle_detection(lidar_angle, lidar_dist)
                # obs = []
            except:
                obs = obs
            
            if uvlamp_off_button:
                try:
                    if p_state == "ON":
                        plug.turn_off()
                        off_t = datetime.datetime.now()
                        p_state = plug.state
                        #print(off_t)

                        act_t = off_t - on_t
                        #print(act_t)
                        spl = (str(act_t).split(':'))
                        hour = int(spl[0])
                        # print(hour)
                        minu = int(spl[1])

                        with open("lampdata.json", 'r') as p:
                            lamp_data = json.load(p)

                            prev_hour = lamp_data["hours"]

                            prev_min = lamp_data["minutes"]


                        totalhour = hour + prev_hour

                        totalmin = minu + prev_min
                        if totalmin == 60:
                            totalhour = totalhour + 1
                            totalmin = 0
                        else:
                            totalhour = totalhour
                            totalmin = totalmin

                    json_dict = {"hours": totalhour, "minutes": totalmin, "status": p_state}
    
                    with open("lampdata.json", "w") as out_file:
                        json.dump(json_dict, out_file)
                    cmd1 = 'echo $(cat lampdata.json) > /dev/pts/1'
                    subprocess.run(cmd1, shell = True)

                except:
                    print("cannot switch on")
           
            elif uvlamp_on_button:
                try:
                    if p_state == "OFF":
                        plug.turn_on()
                        on_t = datetime.datetime.now()
                        p_state = plug.state
                        #print(on_t)
            
                    json_dict = {"hours": totalhour, "minutes": totalmin, "status": p_state}
    
                    with open("lampdata.json", "w") as out_file:
                        json.dump(json_dict, out_file)
                    cmd1 = 'echo $(cat lampdata.json) > /dev/pts/1'
                    subprocess.run(cmd1, shell = True)
                except:
                    print("cannot switch off")
            # Run using gamepad controls
 
            if not unsafe_mode_button and obs[0]:
                print("Obstacle!")
                rpmL, rpmR = moter_rpm(axis[AXIS_LEFT_STICK_X], axis[AXIS_LEFT_STICK_Y] * -1)
                print(rpmL, rpmR)

                if obs[3]:
                    print("left")
                    if rpmR > 0:
                        rpmR, rpmL = 0, 0
                        print("U will crasshhh")
                if obs[2]:
                    print("right")
                    if rpmL > 0:
                        rpmR, rpmL = 0, 0
                        print("U will crasshhh")
                if obs[1] == "front":
                    print("front")
                    if rpmR > 0 and rpmL > 0:
                        rpmR, rpmL = 0, 0
                        print("U will crasshhh")

            elif front_button >= 0.5:
                turn = "no_turn"
                rpmR, rpmL = 0, 0

            elif (turn == "left_180_turn") or ((back_button > 0.5) and (left_button > 0.5)):
                print('left180')
                rpmR, rpmL = turn_180(np.pi, 'left', pkt)

            elif (turn == "right_180_turn") or ((back_button > 0.5) and (right_button > 0.5)):
                print('right180')
                rpmR, rpmL = turn_180(np.pi, 'right', pkt)

            elif turn == "left_turn" or left_button < old_left_button:
                print('left90')
                rpmR, rpmL = turn_90(np.pi / 2, 'left', pkt)

            elif turn == "right_turn" or right_button < old_right_button:
                print('right90')
                rpmR, rpmL = turn_90(np.pi / 2, 'right', pkt)

            elif auto_mode_button >= 0.5:
                print("AUTO MODE")
                rpmR = float(rpmRs)
                rpmL = float(rpmLs)
            else:

                rpmL, rpmR = moter_rpm(stick_l, stick_r)
                print('MANUAL MODE')
            print(rpmR, rpmL)
            SendFloat(rpmR*0.95, rpmL)

            old_back_button = back_button
            old_left_button = left_button
            old_right_button = right_button

        except Exception as e:
            print(e)
            rpmL = rpmL * 0.5
            rpmR = rpmR * 0.5
            SendFloat(rpmR, rpmL)
            print('except2')

        # slowdown the loop speed
        # clock = pygame.time.Clock()
        # clock.tick(30)



