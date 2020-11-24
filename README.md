# ATCart-momo

This is a script to communicate with Cube pilot by using dronekit API and to receive commands from momo/ayame WebRTC by user from the browser.

`AP_momo_test.py` is the main file.

You must run `sh 01_socat.sh` at first to open the /dev/pts/** port.

In order to make it functional, these script must be on the robot side, and three channels (2 of camera channels and one of data channel) of momo/ayame have to be running as well.

## Run
The process to run right now is pretty much manually, you will ned to run `sh 01_socat.sh` at first then memorize the second port.

Start 3 channels of momo/ayame, there should be momo executable file on the robot, download it from [here](https://github.com/shiguredo/momo/releases) 

Run on the real robot, `python3 AP_momo_test.py --port /dev/pts/<second generated port above from socat>`

Run on the simulator SITL, `python3 AP_momo_test.py --port /dev/pts/<second generated port above from socat> --sim sitl`, this is in case you have Arduplilot SITL on your Jetson or your PC, then to start the simluator from ardupilot directory go to  `cd Tools/autotest`, then you can run this command


`sim_vehicle.py -v Rover -f rover-skid --map --console`


Please check on how to install and setup SITL [here](https://ardupilot.org/dev/docs/sitl-simulator-software-in-the-loop.html), if you want to try the simulator.