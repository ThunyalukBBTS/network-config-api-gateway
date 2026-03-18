# Nokia SR Linux Docker Setup

This setup provides a Nokia SR Linux container with native gNMI and NETCONF support for testing the Network API Gateway.

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
| NETCONF | 830 | NETCONF (SSH) |
| SSH | 2222 | SSH management |
| Web UI | 8080 | HTTP web interface |
| JSON-RPC | 8080 | JSON-RPC API |

## Default Credentials

- **Username:** `admin`
- **Password:** `Admin123`

## Connecting

### gNMI CLI (gnmic)

```bash
# Install gnmic: go install github.com/openconfig/gnmic@latest
gnmic -a localhost:57400 -u admin -p Admin123 --insecure get \
  --path /interface/interface[name=ethernet-1/1]/admin-state

# Subscribe to telemetry
gnmic -a localhost:57400 -u admin -p Admin123 --insecure subscribe \
  --path /interface/interface/state/admin-state
```

### NETCONF (ncclient)

```python
from ncclient import manager

conn = manager.connect(
    host="localhost",
    port=830,
    username="admin",
    password="Admin123",
    hostkey_verify=False
)
```

### SSH Management

```bash
ssh -p 2222 admin@localhost
# Password: Admin123

# Or use docker exec
docker exec -it srlinux-router sr_cli
```

## API Gateway Configuration

Update your `.env` file:

```bash
# gNMI Configuration (recommended)
GNMI_HOST=127.0.0.1
GNMI_PORT=57400
GNMI_USERNAME=admin
GNMI_PASSWORD=Admin123
GNMI_INSECURE=true

# NETCONF Configuration (alternative)
NETCONF_HOST=127.0.0.1
NETCONF_PORT=830
NETCONF_USERNAME=admin
NETCONF_PASSWORD=Admin123

# Protocol Selection
PREFERRED_PROTOCOL=gnmi
MOCK_MODE=false
```

## SR Linux Commands

Inside the container or via SSH:

```bash
# Enter SR Linux CLI
docker exec -it srlinux-router sr_cli

# Show version
show version

# Show interfaces
show interface

# Show configuration
show configuration

# Show gNMI server status
info from state system gnmi-server

# Show NETCONF status
info from state system netconf-server

# Exit CLI
exit
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker logs srlinux-router

# Check if ports are available
netstat -tuln | grep -E '(57400|830|2222)'
```

### gNMI connection refused
```bash
# Verify gNMI is enabled
docker exec srlinux-router sr_cli -d "info from state system gnmi-server"

# Check firewall
sudo ufw allow 57400/tcp
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
