import subprocess
import json


# rover_status = {'lat' : 35.1231123, 
# 				'lng' : 134.3143413,
# 				'yaw' : 0.1443,
# 				'gps' : 3
# 				}

rover_status = {"lat" : 35.1231123, "lng" : 134.3143413, "yaw" : 0.1443, "gps" : 3}


out_file_path = "/home/nvidia/ATCart-momo/rover_status.txt"

while True:

	# file = open(out_file_path, "w+")
	# json_data = json.dumps(rover_status)
	# file.write(json_data)
	cmd1 = 'echo $(cat rover_status.txt) > /dev/pts/6'
	subprocess.run(cmd1, shell = True)
