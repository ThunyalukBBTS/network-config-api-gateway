## int interface
gnmic -a 172.20.20.2:57400 \
  -u admin -p 'NokiaSrl1!' \
  --skip-verify \
  -e json_ietf \
  set \
  --update-path "/interface[name=ethernet-1/1]" \
  --update-file int-config.json

## ผูก Interface เข้ากับ Network Instance
gnmic -a 172.20.20.2:57400 \
  -u admin -p 'NokiaSrl1!' \
  --skip-verify \
  -e json_ietf \
  set \
  --update-path "/network-instance[name=default]/interface[name=ethernet-1/1.0]" \
  --update-value '{"name": "ethernet-1/1.0"}'

## open OSPF
gnmic -a 172.20.20.2:57400 \
  -u admin -p 'NokiaSrl1!' \
  --skip-verify \
  -e json_ietf \
  set \
  --update-path "/network-instance[name=default]/protocols/ospf/instance[name=1]" \
  --update-file ospf-srl.json


# --------------------

## check ospf 
gnmic -a 172.20.20.2:57400 \
  -u admin -p 'NokiaSrl1!' \
  --skip-verify \
  -e json_ietf \
  get \
  --path "/network-instance[name=default]/protocols/ospf/instance[name=1]/area[area-id=0.0.0.0]/interface[interface-name=ethernet-1/1.0]/neighbor"

## check routing table
gnmic -a 172.20.20.2:57400 \
  -u admin -p 'NokiaSrl1!' \
  --skip-verify \
  -e json_ietf \
  get \
  --path "/network-instance[name=default]/route-table/ipv4-unicast/route"



# test ospf
### router
enter candidate
set interface ethernet-1/1 subinterface 0 ipv4 address 10.0.1.1/24
set interface ethernet-1/2 subinterface 0 ipv4 address 10.0.2.1/24
commit save

### host1
ip addr add 10.0.1.2/24 dev eth1
ip link set eth1 up

### host2
ip addr add 10.0.2.2/24 dev eth1
ip link set eth1 up


### open ospf manual
```bash
enter candidate

set network-instance default protocols ospf instance 1 router-id 1.1.1.1

set network-instance default protocols ospf instance 1 area 0.0.0.0 interface ethernet-1/1.0
set network-instance default protocols ospf instance 1 area 0.0.0.0 interface ethernet-1/2.0

commit save
```