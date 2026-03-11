# Cisco ISR4321 Router Configuration

## Network API Gateway Router Setup

This configuration enables NETCONF, gNMI, and AAA management access on the Cisco ISR4321 router.

## Prerequisites

- Cisco ISR4321 with IOS XE 16.9.3+
- Serial console access (use `mise console` to connect)
- Management network: 192.168.1.0/24

## Management Interface Configuration

```cisco
! Enter configuration mode
configure terminal

! Configure Management Port (GigabitEthernet0)
interface GigabitEthernet0
 description Management Port - API Gateway
 ip address 192.168.1.1 255.255.255.0
 no shutdown
 exit

! Configure a data port for testing (GigabitEthernet0/0/0)
interface GigabitEthernet0/0/0
 description WAN Interface
 ip address dhcp
 no shutdown
 exit

! Configure LAN interface (GigabitEthernet0/0/1)
interface GigabitEthernet0/0/1
 description LAN Network
 ip address 10.0.0.1 255.255.255.0
 no shutdown
 exit
```

## AAA Configuration

```cisco
! Enable AAA
aaa new-model

! Configure local authentication
aaa authentication login default local
aaa authorization exec default local

! Create admin user for API access
username admin privilege 15 secret admin123
```

## SSH Configuration

```cisco
! Generate RSA keys for SSH
crypto key generate rsa
 2048

! Configure SSH v2 only
ip ssh version 2

! Allow SSH from management network
access-list 1 permit 192.168.1.0 0.0.0.255
access-list 1 deny any

! Apply access list to VTY lines
line vty 0 4
 transport input ssh
 access-class 1 in
 login local
 exit
```

## NETCONF Configuration

```cisco
! Enable NETCONF-YANG
netconf-yang

! Configure NETCONF to listen on all interfaces
netconf-yang default-protocol ssh

! Optional: Set NETCONF session timeout (in minutes)
netconf-yang session timeout 30

! Optional: Set maximum NETCONF sessions
netconf-yang session max 10
```

## gNMI Configuration (IOS XE 17.3+)

```cisco
! Enable gNMI
gnmi
 hostname router
 port 9339

! Configure gNMI authentication (local)
 aaa authentication gnmi local

! Enable secure TLS
 tls 1.2

! Set gNMI path for interfaces
 interface GigabitEthernet0
  gnmi-interface-path
 exit

! Set gNMI path for routing
 gnmi-routing-config all
```

## RESTCONF Configuration (Alternative)

```cisco
! Enable RESTCONF
restconf

! Configure RESTCONF
ip http secure-server
ip http authentication local
```

## Test Routes

```cisco
! Default route to gateway (adjust gateway IP as needed)
ip route 0.0.0.0 0.0.0.0 192.168.1.254

! Route to backend server (if on different network)
ip route 10.0.1.0 255.255.255.0 192.168.1.254

! Route to test public connectivity (example: 8.8.8.8)
ip route 8.8.8.8 255.255.255.255 192.168.1.254
```

## Verification Commands

```cisco
! Check interface status
show ip interface brief

! Check NETCONF status
show netconf-yang status

! Check gNMI status
show gnmi status

! Check AAA users
show running-config | include username

! Test SSH connectivity
show ssh

! Check routing table
show ip route

! Ping test to backend
ping 192.168.1.100

! Ping test to public DNS
ping 8.8.8.8

! Traceroute to test path
traceroute 8.8.8.8
```

## Connectivity Test from Router

```cisco
! Test connection to backend server
ping 192.168.1.100 repeat 5

! Test connection to gateway
ping 192.168.1.254 repeat 5

! Test DNS resolution
ping 8.8.8.8 repeat 5

! Test HTTP/HTTPS (if needed)
ping 1.1.1.1 repeat 5
```

## Backend Environment Configuration

Update `.env` file in backend:

```env
# NETCONF Configuration
NETCONF_HOST=192.168.1.1
NETCONF_PORT=830
NETCONF_USERNAME=admin
NETCONF_PASSWORD=admin123

# gNMI Configuration
GNMI_HOST=192.168.1.1
GNMI_PORT=9339
GNMI_USERNAME=admin
GNMI_PASSWORD=admin123
GNMI_INSECURE=false

# Disable mock mode to use real router
MOCK_MODE=false
```

## Test Connectivity from Backend

```bash
# Test NETCONF port
nc -zv 192.168.1.1 830

# Test gNMI port
nc -zv 192.168.1.1 9339

# Ping test
ping -c 5 192.168.1.1

# Traceroute
traceroute 192.168.1.1
```

## Quick Start Checklist

- [ ] Connect via serial console (`mise console`)
- [ ] Configure management interface (GigabitEthernet0)
- [ ] Enable AAA and create users
- [ ] Generate SSH keys
- [ ] Enable NETCONF
- [ ] Enable gNMI (if IOS XE 17.3+)
- [ ] Add test routes
- [ ] Verify connectivity from router
- [ ] Verify connectivity from backend
- [ ] Update backend `.env` configuration
- [ ] Test API endpoints

## Notes

- Configuration is NOT saved to startup-config (no `write memory`)
- Settings will be lost on router reboot
- To save permanently (if needed): `copy running-config startup-config`
- Adjust IP addresses based on your network topology
- Use strong passwords in production environment
