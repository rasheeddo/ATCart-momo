import sys
import json
import socket
import struct
import configparser
import time
from retry import retry
import timeout_decorator

ini_config = configparser.ConfigParser()
ini_config.read('FARBOT.ini')

section = 'moab'
MOAB_COMPUTER = str(ini_config.get(section, 'MOAB_COMPUTER'))
MOAB_PORT = int(ini_config.get(section, 'MOAB_PORT'))
#SBUS_PORT = int(ini_config.get(section, 'SBUS_PORT'))

section = 'machine'
MAX_CHASE_SPEED    = float(ini_config.get(section, 'MAX_CHASE_SPEED'))

# This is the sbus udp port.
sbus_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sbus_sock.bind(("0.0.0.0", 0))

darknet_farbot_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
darknet_farbot_sock.bind(("192.168.8.26", 50000))

#axes0:Lスティック左,右(-1 <= 0.00 >= +1)
#axes1:Lスティック上,下(-1 <= 0.00 >= +1)
#ニュートラルポジション帯
MAX_DEADBAND = 0.1
MIN_DEADBAND = -0.1

#スティックの最大値,最小値
MAX_STICK = 1
MIN_STICK = -1


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
        if(axes0 > MAX_DEADBAND and axes1 > MAX_DEADBAND):
            SCALE_X = map(axes0, MAX_DEADBAND, MAX_STICK, 0, MAX_CHASE_SPEED/2)
            SCALE_Y = map(axes1, MAX_DEADBAND, MAX_STICK, 0, MAX_CHASE_SPEED)
            SCALE = map(axes0, MAX_DEADBAND, MAX_STICK, 1, -1/2)
            MotorRPM_L = abs(SCALE_Y - SCALE_X)
            MotorRPM_R = abs(SCALE_Y - SCALE_X) * SCALE

        elif(axes0 < MIN_DEADBAND and axes1 > MAX_DEADBAND):
            SCALE_X = map(axes0, MIN_DEADBAND, MIN_STICK, 0, MAX_CHASE_SPEED/2)
            SCALE_Y = map(axes1, MAX_DEADBAND, MAX_STICK, 0, MAX_CHASE_SPEED)
            SCALE = map(axes0, MIN_DEADBAND, MIN_STICK, 1, -1/2)
            MotorRPM_L = abs(SCALE_Y - SCALE_X) * SCALE
            MotorRPM_R = abs(SCALE_Y - SCALE_X)

        elif(axes0 > MAX_DEADBAND and axes1 < MIN_DEADBAND):
            SCALE_X = map(axes0, MAX_DEADBAND, MAX_STICK, 0, -MAX_CHASE_SPEED/2)
            SCALE_Y = map(axes1, MIN_DEADBAND, MIN_STICK, 0, -MAX_CHASE_SPEED)
            SCALE = map(axes0, MAX_DEADBAND, MAX_STICK, -1, 1/2)
            MotorRPM_L = SCALE_Y - SCALE_X
            MotorRPM_R = -1 * (SCALE_Y - SCALE_X) * SCALE

        elif(axes0 < MIN_DEADBAND and axes1 < MIN_DEADBAND):
            SCALE_X = map(axes0, MIN_DEADBAND, MIN_STICK, 0, -MAX_CHASE_SPEED/2)
            SCALE_Y = map(axes1, MIN_DEADBAND, MIN_STICK, 0, -MAX_CHASE_SPEED)
            SCALE = map(axes0, MIN_DEADBAND, MIN_STICK, -1, 1/2)
            MotorRPM_L = -1 * (SCALE_Y - SCALE_X) * SCALE
            MotorRPM_R = SCALE_Y - SCALE_X
        
        return MotorRPM_L, MotorRPM_R

@retry(tries=5)
@timeout_decorator.timeout(0.1, timeout_exception = StopIteration, exception_message="socat time out")
def read_socat(term):
    read = term.readline().decode()
    return read

rpmRs, rpmLs = 0, 0
with open("/dev/pts/1", "rb", buffering=0) as term:
    str_buffer = ''
    rpmL = 0.0
    rpmR = 0.0
    while True:
        try:
            data, fromAddr = darknet_farbot_sock.recvfrom(1024, socket.MSG_DONTWAIT)
            rpmRs, rpmLs = data.decode().split("and")
        except:
            rpmRs, rpmLs = rpmRs, rpmLs

        try:
            str_buffer = read_socat(term)
            dec = json.loads(str_buffer)
            auto_mode_button = dec['BUTTON']['#04']
            if auto_mode_button >= 1:
                print("AUTO MODE")
                rpmR = float(rpmRs)
                rpmL = float(rpmLs)
            else:
                rpmL, rpmR = moter_rpm(dec['AXES']['#00'],dec['AXES']['#01']*-1)
            print(rpmR,rpmL)
            SendFloat(rpmR,rpmL)
        except:
            rpmL = rpmL * 0.5
            rpmR = rpmR * 0.5
            SendFloat(rpmR,rpmL)
            #print("No control signal:"+str(rpmL),str(rpmR))
        
        str_buffer = ''
        #sys.stdout.flush()

