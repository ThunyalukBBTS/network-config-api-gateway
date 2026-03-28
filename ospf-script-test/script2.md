## set Interface
gnmic -a 172.20.20.2:57400 \
  -u admin -p 'NokiaSrl1!' \
  --skip-verify \
  -e json_ietf \
  set \
  --update-path "/" \
  --update-file interfaces.json

## make default network-instance
gnmic -a 172.20.20.2:57400 \
  -u admin -p 'NokiaSrl1!' \
  --skip-verify \
  -e json_ietf \
  set \
  --update-path "/network-instance[name=default]" \
  --update-file netinst.json

## set ip at host (manual set because it's not router)
### at host 1
ip addr add 10.0.1.2/24 dev eth1
ip link set eth1 up
ip route add 10.0.2.0/24 via 10.0.1.1

### at host 2
ip addr add 10.0.2.2/24 dev eth1
ip link set eth1 up
ip route add 10.0.1.0/24 via 10.0.2.1
