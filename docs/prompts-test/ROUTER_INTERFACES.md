# Cisco ISR4321 Router Interfaces

## Available Interfaces

This document lists all available interfaces on the Cisco ISR4321 router for configuration via the Network API Gateway.

## Management Interfaces

### GigabitEthernet0 (Management Port)
- **Type:** RP Management Port
- **MAC Address:** 4c71.0c7a.8a5f
- **Default Status:** administratively down
- **Purpose:** Out-of-band management for NETCONF/gNMI/API access
- **Configuration:**
  ```cisco
  interface GigabitEthernet0
   description Management Port - API Gateway
   ip address 192.168.1.1 255.255.255.0
   no shutdown
  ```

## Built-in Router Interfaces

### GigabitEthernet0/0/0 (WAN Port)
- **Type:** ISR4321-2x1GE (Built-in Gigabit Ethernet)
- **MAC Address:** 4c71.0c7a.89d0
- **Default Status:** down
- **Media Type:** Auto Select
- **Flow Control:** Supported (TX/RX)
- **Use Case:** WAN connection, upstream link to ISP

### GigabitEthernet0/0/1 (LAN Port)
- **Type:** ISR4321-2x1GE (Built-in Gigabit Ethernet)
- **MAC Address:** 4c71.0c7a.89d1
- **Default Status:** administratively down
- **Media Type:** RJ45
- **Flow Control:** Not supported
- **Use Case:** LAN connection, downstream network

## Serial Interfaces (WAN Cards)

### Serial0/1/0
- **Type:** NIM-2T (2-Port Serial Network Interface Module)
- **Default Status:** administratively down
- **Encapsulation:** HDLC
- **Keepalive:** 10 seconds
- **Use Case:** Serial WAN connections (legacy T1/E1, point-to-point)

### Serial0/1/1
- **Type:** NIM-2T (2-Port Serial Network Interface Module)
- **Default Status:** administratively down
- **Encapsulation:** HDLC
- **Keepalive:** 10 seconds
- **Use Case:** Serial WAN connections (legacy T1/E1, point-to-point)

## Switch Module Interfaces (NIM-ES2-4)

### GigabitEthernet0/2/0
- **Type:** NIM-ES2-4 (4-Port Ethernet Switch Module)
- **MAC Address:** 4c71.0c7a.89e0
- **Default Status:** down (notconnect)
- **Media Type:** 10/100/1000BaseTX
- **Flow Control:** TX off, RX unsupported
- **Use Case:** Layer 2 switch ports for LAN expansion

### GigabitEthernet0/2/1
- **Type:** NIM-ES2-4 (4-Port Ethernet Switch Module)
- **MAC Address:** 4c71.0c7a.89e1
- **Default Status:** down (notconnect)
- **Media Type:** 10/100/1000BaseTX
- **Use Case:** Layer 2 switch ports for LAN expansion

### GigabitEthernet0/2/2
- **Type:** NIM-ES2-4 (4-Port Ethernet Switch Module)
- **MAC Address:** 4c71.0c7a.89e2
- **Default Status:** down (notconnect)
- **Media Type:** 10/100/1000BaseTX
- **Use Case:** Layer 2 switch ports for LAN expansion

### GigabitEthernet0/2/3
- **Type:** NIM-ES2-4 (4-Port Ethernet Switch Module)
- **MAC Address:** 4c71.0c7a.89e3
- **Default Status:** down (notconnect)
- **Media Type:** 10/100/1000BaseTX
- **Flow Control:** TX off, RX unsupported
- **Use Case:** Layer 2 switch ports for LAN expansion

## VLAN Interfaces

### Vlan1
- **Type:** Ethernet SVI (Switched Virtual Interface)
- **MAC Address:** 4c71.0c7a.8a54
- **Default Status:** up, line protocol is down
- **Autostate:** Enabled
- **Use Case:** Layer 3 interface for VLAN 1 management

## Interface Naming Convention

- **GigabitEthernet0** - Management port (fixed)
- **GigabitEthernet0/0/0** - Slot 0, Subslot 0, Port 0 (built-in)
- **GigabitEthernet0/0/1** - Slot 0, Subslot 0, Port 1 (built-in)
- **GigabitEthernet0/2/X** - Slot 0, Subslot 2 (switch module), Port X
- **Serial0/1/X** - Slot 0, Subslot 1 (serial module), Port X

## API Usage

### Get All Interfaces
```bash
GET /api/interfaces
Authorization: Bearer <token>
```

### Get Specific Interface
```bash
GET /api/interfaces/GigabitEthernet0
Authorization: Bearer <token>
```

### Configure Interface
```bash
POST /api/interfaces
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "GigabitEthernet0/0/0",
  "ip": "192.168.100.1/24",
  "description": "WAN Interface",
  "enabled": true
}
```

## Configuration Examples

### Configure WAN Interface (DHCP)
```cisco
interface GigabitEthernet0/0/0
 description WAN Interface
 ip address dhcp
 no shutdown
```

### Configure LAN Interface (Static)
```cisco
interface GigabitEthernet0/0/1
 description LAN Network
 ip address 10.0.0.1 255.255.255.0
 no shutdown
```

### Configure Switch Port
```cisco
interface GigabitEthernet0/2/0
 description LAN Port 1
 switchport mode access
 switchport access vlan 1
 no shutdown
```

### Configure Serial Interface
```cisco
interface Serial0/1/0
 description Point-to-Point WAN
 ip address 172.16.0.1 255.255.255.252
 encapsulation hdlc
 no shutdown
```

## Interface States

| State | Description |
|-------|-------------|
| `administratively down` | Interface is disabled in config (use `no shutdown`) |
| `down` | Interface is enabled but no link detected |
| `down (notconnect)` | Switch port with no cable connected |
| `up` | Interface is operational |
| `up, line protocol is down` | Interface is up but Layer 2 is down |

## Common Commands

```cisco
! Show all interfaces
show ip interface brief

! Show specific interface details
show interface GigabitEthernet0

! Show interface configuration
show running-config interface GigabitEthernet0/0/0

! Show interface counters
show interface counters

! Show interface errors
show interface GigabitEthernet0/0/0 | include error
```

## Notes

- All interfaces support MTU 1500 bytes by default
- Keepalive is not supported on built-in GigabitEthernet ports
- Serial interfaces default to HDLC encapsulation
- Switch module ports (0/2/X) operate at Layer 2 by default
- Management port (GigabitEthernet0) is isolated from data plane
