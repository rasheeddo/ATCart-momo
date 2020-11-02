import numpy as np
from numpy import pi
import socket
import struct
import pickle
import time
import os
import json
os.environ["MAVLINK20"] = "2"
from apscheduler.schedulers.background import BackgroundScheduler
from dronekit import connect, VehicleMode
from pymavlink import mavutil
import subprocess

# FCU connection variables
vehicle = None
is_vehicle_connected = False

global rover_status

cur_lat = 0.0
cur_lon = 0.0
cur_yaw = 0.0
gps_status = 0

rover_status = {"lat" : cur_lat, 
				"lon" : cur_lon,
				"yaw" : cur_yaw,
				"gps" : gps_status
				}

def vehicle_connect():
	global vehicle, is_vehicle_connected

	if vehicle == None:
		try:
			print("Connecting to Ardupilot....")
			vehicle = connect('/dev/ttyUSB1', wait_ready=True, baud=921600)
		except:
			print('Connection error! Retrying...')
			vehicle = connect('/dev/ttyUSB0', wait_ready=True, baud=921600)
			time.sleep(1)

	if vehicle == None:
		is_vehicle_connected = False
		return False
	else:
		is_vehicle_connected = True
		return True

def turn(deg):
	if is_vehicle_connected == True:
		msg = vehicle.message_factory.set_position_target_local_ned_encode(
			0,       # time_boot_ms (not used)
			0, 0,    # target system, target component
			mavutil.mavlink.MAV_FRAME_BODY_NED, # frame
			0b0000101111111111, # type_mask (only speeds enabled)
			0, 0, 0, # x, y, z positions (not used)
			0, 0, 0, # x, y, z velocity in m/s
			0, 0, 0, # x, y, z acceleration (not supported yet, ignored in GCS_Mavlink)
			deg*pi/180.0, 0)    # yaw, yaw_rate (not supported yet, ignored in GCS_Mavlink)

		vehicle.send_mavlink(msg)
		# vehicle.flush()
	else:
		print("INFO: Vehicle not connected.")

def read_socat(term):
	read = term.readline().decode()
	return read

# Callback to print the location in global frame
def location_callback(self, attr_name, value):
	# global cur_lat, cur_lon
	cur_lat = value.global_frame.lat
	cur_lon = value.global_frame.lon
	# print("cur_lat: %.7f  cur_lon: %.7f" %(cur_lat, cur_lon))
	rover_status['lat'] = cur_lat
	rover_status['lon'] = cur_lon
	
	# print(value.global_frame)

def attitude_callback(self, attr_name, value):
	# global cur_yaw
	cur_yaw = value.yaw
	# print("cur_yaw: %.6f" %cur_yaw)
	rover_status['yaw'] = cur_yaw
	## range is -pi to pi, 0 is north

def gps_callback(self, attr_name, value):
	# global gps_status
	gps_status = value.fix_type
	# print("gps_status: %d" %gps_status)
	rover_status['gps'] = gps_status
	# 3 = 3DFix
	# 4 = 3DGPS
	# 5 = rtkFloat
	# 6 = rtkFixed
	## range is -pi to pi, 0 is north


print("INFO: Connecting to vehicle.")
while (not vehicle_connect()):
	pass
print("INFO: Vehicle connected.")

vehicle.mode = 'HOLD'
current_mode = 'HOLD'

#BUTTONS:
# 0 A   		AUTO
# 1 B   		HOLD
# 2 X   		MANUAL
# 3 Y   		ARMDISARM
# 4 LB  		left 45
# 5 RB  		right 45 
# 6 LT  		left 90
# 7 RT  		right 90
# 16 Logicool   turn 180

#AXES
# Axis1 left stick up down
# Axis2 right stick left right

vehicle.add_attribute_listener('location', location_callback)
vehicle.add_attribute_listener('attitude', attitude_callback)
vehicle.add_attribute_listener('gps_0', gps_callback)

PORT = "/dev/pts/6"

with open(PORT, "rb", buffering=0) as term:

	print("begin")
	while True:
		# print(term)
		try:
			str_buffer = read_socat(term)
			print(str_buffer)
			if str_buffer.startswith('{'):
				dec = json.loads(str_buffer)
				# print("Here")

				if len(str_buffer) > 400:
					if dec['BUTTONS']['#02'] == 1:
						vehicle.mode = 'MANUAL'
						current_mode = 'MANUAL'
						print("MANUAL")

					elif dec['BUTTONS']['#01'] == 1:
						vehicle.mode = 'HOLD'
						current_mode = 'HOLD'
						print("HOLD")

					elif dec['BUTTONS']['#00'] == 1:
						vehicle.mode = 'AUTO'
						current_mode = 'AUTO'
						print("AUTO")

					elif dec['BUTTONS']['#03'] == 1:
						if vehicle.armed == True:
							vehicle.armed= False
						else:
							vehicle.armed = True
						print("ARMDISARM")	

					elif dec['BUTTONS']['#04'] == 1:
						if current_mode != 'GUIDED':
							vehicle.mode = 'GUIDED'
							current_mode = 'GUIDED'
						turn(-45)
						print("TURNLEFT45")

					elif dec['BUTTONS']['#06'] == 1:
						if current_mode != 'GUIDED':
							vehicle.mode = 'GUIDED'
							current_mode = 'GUIDED'
						turn(-90)
						print("TURNLEFT90")

					elif dec['BUTTONS']['#05'] == 1:
						if current_mode != 'GUIDED':
							vehicle.mode = 'GUIDED'
							current_mode = 'GUIDED'
						turn(45)
						print("TURNRIGHT45")

					elif dec['BUTTONS']['#07'] == 1:
						if current_mode != 'GUIDED':
							vehicle.mode = 'GUIDED'
							current_mode = 'GUIDED'
						turn(90)
						print("TURNRIGHT90")

					elif dec['BUTTONS']['#16'] == 1:
						if current_mode != 'GUIDED':
							vehicle.mode = 'GUIDED'
							current_mode = 'GUIDED'
						turn(180)	
						print("TURN180")


					if current_mode == 'MANUAL':
						STR_val = dec['AXES']['#02']
						THR_val = (-1)*dec['AXES']['#01']

						steering_pwm = int(round(STR_val*200 + 1500))
						throttle_pwm = int(round(THR_val*200 + 1500))
						vehicle.channels.overrides['1'] = steering_pwm
						vehicle.channels.overrides['2'] = throttle_pwm
					else:
						vehicle.channels.overrides['1'] = 1500
						vehicle.channels.overrides['2'] = 1500
				
				else:
					if(dec['MANUAL'] == 1):
						vehicle.mode = 'MANUAL'
						current_mode = 'MANUAL'
						print("SCREEN_MANUAL")
					elif(dec['AUTO'] == 1):
						vehicle.mode = 'AUTO'
						current_mode = 'AUTO'
						print("SCREEN_AUTO")
					elif(dec['HOLD'] == 1):
						vehicle.mode = 'HOLD'
						current_mode = 'HOLD'
						print("SCREEN_HOLD")
			
			else:
				if str_buffer.startswith('TURNLEFT45'):
					if current_mode != 'GUIDED':
						vehicle.mode = 'GUIDED'
						current_mode = 'GUIDED'
					turn(-45)
					print("SCREEN_TURNLEFT45")

				elif str_buffer.startswith('TURNLEFT90'):
					if current_mode != 'GUIDED':
						vehicle.mode = 'GUIDED'
						current_mode = 'GUIDED'
					turn(-90)
					print("SCREEN_TURNLEFT90")

				elif str_buffer.startswith('TURNRIGHT45'):
					if current_mode != 'GUIDED':
						vehicle.mode = 'GUIDED'
						current_mode = 'GUIDED'
					turn(45)
					print("SCREEN_TURNRIGHT45")

				elif str_buffer.startswith('TURNRIGHT90'):
					if current_mode != 'GUIDED':
						vehicle.mode = 'GUIDED'
						current_mode = 'GUIDED'
					turn(90)
					print("SCREEN_TURNRIGHT90")

				elif str_buffer.startswith('TURN180'):
					if current_mode != 'GUIDED':
						vehicle.mode = 'GUIDED'
						current_mode = 'GUIDED'
					turn(180)
					print("SCREEN_TURN180")


			with open("rover_status.json", "w") as out_file:
				json.dump(rover_status, out_file)
				cmd1 = f'echo $(cat rover_status.json) > {PORT}'
				subprocess.run(cmd1, shell = True)

			# print('Down herer')

		except KeyboardInterrupt:
			quit()
		except:
			print("Failed to parse")
			pass

			




