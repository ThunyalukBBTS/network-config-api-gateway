# Nokia SR Linux Docker Setup

This setup provides a Nokia SR Linux container with native gNMI support for testing the Network API Gateway.

## Quick Start

```bash
# Start SR Linux container
docker-compose -f docker-compose-srl.yml up -d

# View logs
docker-compose -f docker-compose-srl.yml logs -f

# Check status
docker exec srlinux-router sr_cli -d "show version"
```

## Access Information

| Service | Port | Usage |
|---------|------|-------|
| gNMI | 57400 | gRPC/gNMI client |
| gNMI (TLS) | 57401 | gNMI with TLS |
| SSH | 2222 | SSH management |
| Web UI | 8080 | HTTP web interface |
| JSON-RPC | 8080 | JSON-RPC API |

## Default Credentials

- **Username:** `admin`
- **Password:** `NokiaSrl1!`

## gNMI CLI (gnmic)

```bash
# Install gnmic: go install github.com/openconfig/gnmic@latest

# Check capabilities
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify capabilities

# Get all interfaces
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface' --encoding json_ietf

# Get specific interface
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface[name=ethernet-1/1]' --encoding json_ietf

# Get interface admin state
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface[name=ethernet-1/1]/admin-state'

# Get interface IP address
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface[name=ethernet-1/1]/subinterface[index=0]/ipv4/address' --encoding json_ietf

# Get multiple interface IPs
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface[name=ethernet-1/1]/subinterface[index=0]/ipv4/address' \
  --path '/interface[name=ethernet-1/2]/subinterface[index=0]/ipv4/address' --encoding json_ietf

# Subscribe to telemetry
gnmic -a localhost:57400 -u admin -p NokiaSrl1! --skip-verify subscribe \
  --path /interface/interface/state/admin-state
```

## Configure Interface IP Address (via gNMI)

To set an IP address, you need to first delete the existing one, then add the new one:

```bash
# Step 1: Delete existing IP address
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --delete "/interface[name=ethernet-1/1]/subinterface[index=0]/ipv4/address"

# Step 2: Add new IP address
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --update-path "/interface[name=ethernet-1/1]/subinterface[index=0]/ipv4/address[ip-prefix=192.168.1.1/24]" \
  --update-value '{}'

# Verify the change
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface[name=ethernet-1/1]/subinterface[index=0]/ipv4/address' --encoding json_ietf
```

## Configure Interface Description (via gNMI)

```bash
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --update-path "/interface[name=ethernet-1/1]/description" \
  --update-value '"Elysia-API-Test"'
```

## Configure Interface Admin State (via gNMI)

```bash
# Disable interface
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --update-path "/interface[name=ethernet-1/1]/admin-state" \
  --update-value '"disable"'

# Enable interface
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --update-path "/interface[name=ethernet-1/1]/admin-state" \
  --update-value '"enable"'
```

## Configure Interface MTU (via gNMI)

```bash
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --update-path "/interface[name=ethernet-1/1]/mtu" \
  --update-value '9000'
```

## Nokia SR Linux CLI Commands

### Access via SSH

```bash
ssh -p 2222 admin@localhost
# Password: NokiaSrl1!

# Or use docker exec
docker exec -it srlinux-router sr_cli
```

### Show Commands

```bash
# Show version
show version

# Show all interfaces
show interface

# Show specific interface
show interface ethernet-1/1

# Show configuration
show configuration

# Show running configuration
show running-config

# Show gNMI server status
info from state system gnmi-server

# Show IP routes
show route

# Ping from network instance
ping 192.168.1.2 network-instance default
```

### Transaction-Based Configuration

```bash
# Enter candidate mode
enter candidate

# Set interface IP
set / interface ethernet-1/1 subinterface 0 ipv4 address 192.168.1.1/24

# Set interface description
set / interface ethernet-1/1 description "WAN Interface"

# Commit changes
commit stay

# Or validate before commit
commit validate

# Discard changes
discard now
```

### Network Instance Configuration

```bash
enter candidate

# Enable network instance
set / network-instance default type default admin-state enable

# Bind subinterface to network-instance
set / network-instance default interface ethernet-1/1.0

# Commit changes
commit stay
```

## API Gateway Configuration

Update your `backend/.env` file:

```bash
# gNMI Configuration
GNMI_HOST=172.20.20.4
GNMI_PORT=57400
GNMI_USERNAME=admin
GNMI_PASSWORD=NokiaSrl1!
GNMI_INSECURE=true

# Disable mock mode to connect to real router
MOCK_MODE=false
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker logs srlinux-router

# Check if ports are available
netstat -tuln | grep -E '(57400|2222)'
```

### gNMI connection refused
```bash
# Verify gNMI is enabled
docker exec srlinux-router sr_cli -d "info from state system gnmi-server"

# Check firewall
sudo ufw allow 57400/tcp
```

### Verify interface configuration
```bash
# Via gNMI
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface[name=ethernet-1/1]' --encoding json_ietf

# Via SR Linux CLI
docker exec -it srlinux-router sr_cli -d "show interface ethernet-1/1"
```

### Reset configuration
```bash
# Stop container
docker-compose -f docker-compose-srl.yml down

# Remove volume
docker volume rm modern-network-project_srl-config

# Restart
docker-compose -f docker-compose-srl.yml up -d
```

## Cleanup

```bash
# Stop and remove
docker-compose -f docker-compose-srl.yml down

# Remove volumes
docker volume rm modern-network-project_srl-config

# Remove image
docker rmi ghcr.io/nokia/srlinux:24.3.3
```

## References

- [SR Linux Documentation](https://documentation.nokia.com/srlinux/)
- [gNMI in SR Linux](https://documentation.nokia.com/srlinux/24-3-3/books/gnmi/)
- [SR Linux Docker Images](https://github.com/nokia/srlinux-container-tools)
- [gnmic Documentation](https://gnmic.openconfig.net/)
