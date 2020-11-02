import sys
if sys.version_info[0] < 3:
	raise Exception("Must be using Python 3")


import json
import socket
import struct
import os
import time


def read_socat(term):
	read = term.readline().decode()
	return read


	


with open("/dev/pts/6", "rb", buffering=0) as term:
	while True:
		# print(term)
		try:
			# print(term)
			str_buffer = read_socat(term)
			# print("type ", type(term))
			print(str_buffer)
			# print("len ",len(str_buffer))
			# print("here")

			# print("len ", len(str_buffer))

			dec = json.loads(str_buffer)
			if len(str_buffer) > 400:
				print("Ax1  %f    Ax2 %f" %(float(dec["AXES"]["#01"]), float(dec["AXES"]["#02"])) )
			else:
				print("no gamepad")


			# if str_buffer.startswith('{'):
			# 	dec = json.loads(str_buffer)
			# 	if len(str_buffer) > 400:
			# 		print("Ax1  %f    Ax2 %f" %(float(dec["AXES"]["#01"]), float(dec["AXES"]["#02"])) )
			# 	else:
			# 		print("MAN %d AUTO %d HOLD %d" %(int(dec["MANUAL"]), int(dec["AUTO"]), int(dec["HOLD"])) )
			# else:
			# 	print(str_buffer)

		except KeyboardInterrupt:
			quit()
		except:
			print("Failed to parse")
			print(str_buffer)
			# tmp = json.dumps(term)
			# print("type except", type(term))
			pass

		# print(str_buffer)
		# try:



		# 	str_buffer = read_socat(term)
			
		# 	dec = json.loads(str_buffer)
		# 	print(str_buffer)
		# 	# print("Ax1", dec['AXES']['#01'])
		# 	# print("Ax2", dec['AXES']['#02'])
		# except:
		# 	print("ERROR")
		# 	time.sleep(1)