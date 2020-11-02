#! /bin/sh

# List all the available ports
ports=$(ls /dev/pts/)

# Make the string of available ports to an array
arr=($ports)

# length of an array, basically it would be like, 0 1 2 ptmx , something like this
# so ptmx is not necessary one
total_ports=${#arr[@]}

# then if we start 01_socat.sh from now, it would generate /dev/pts/3 and /dev/pts/4 for us

for i in ${arr[@]}; do echo $i; done
## print array's element out
