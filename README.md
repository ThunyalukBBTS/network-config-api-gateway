# Network API Gateway

REST API Gateway for network router management using gNMI protocol with Nokia SR Linux devices.

## Features

- **Authentication**: JWT-based authentication with role-based access control
- **Interfaces**: View and configure network interfaces (ethernet-1/1 to ethernet-1/58)
- **Routing**: Configure connected routing by binding interfaces to network-instance
- **Audit Logging**: Track all configuration changes
- **Mock Mode**: Development without physical router

## Tech Stack

- **Framework**: Elysia (Bun/TypeScript)
- **Database**: PostgreSQL
- **Authentication**: JWT with bcrypt
- **Documentation**: Swagger/OpenAPI
- **Southbound**: gNMI (Nokia SR Linux)

## Quick Start

> **Important:** Before using interfaces or routes endpoints, you must first configure the router by calling `POST /api/config/router` with the router IP, username, and password.

### Prerequisites

- [Bun](https://bun.sh/) >= 1.1.0
- [Docker](https://www.docker.com/) (for PostgreSQL)
- [mise](https://mise.jdx.dev/) (task runner, optional)
- [gNMI] (https://gnmic.openconfig.net/install/) (v0.45.0)

### Installation

1. Clone the repository:
```bash
cd /home/btxs/Desktop/MyData/modern_network/project
```

2. Install dependencies:
```bash
bun install --cwd backend
```

3. Start PostgreSQL:
```bash
mise db-up
# or
docker compose -f docker/docker-compose.yml up -d
```

4. Run database migrations:
```bash
mise migrate
# or
bun backend/src/db/migrate.ts
```

5. Seed database with default users:
```bash
mise seed
# or
bun backend/src/db/seed.ts
```

6. Configure environment:
```bash
cp ./backend/.env.example ./backend/.env
# Edit .env with your settings
```

7. Start srl-linux (containerlab) for test
```bash
mise clab-up
# or
docker compose -f ./containerlab/containerlab deploy -t project.clab.yml
```

8. Start the server:
```bash
mise dev
# or
bun --watch backend/src/index.ts
```

The API will be available at `http://localhost:3000`

## API Documentation

Once the server is running, visit `http://localhost:3000/docs` for interactive Swagger documentation.

## Testing Workflow

Follow these steps to get started with the Network API Gateway:

### 1. Login and get JWT token
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```
**Response:** Copy the `token` from the response for use in subsequent requests.

### 2. Configure router connection
```bash
curl -X POST http://localhost:3000/api/config/router \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{
    "ip": "172.20.20.2",
    "port": 57400,
    "user": "admin",
    "pass": "NokiaSrl1!"
  }'
```

### 3. Configure interfaces with IP addresses
```bash
# Configure ethernet-1/1
curl -X POST http://localhost:3000/api/interfaces/ethernet-1/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{
    "ip": "192.168.1.1/24",
    "description": "to host1"
  }'

# Configure ethernet-1/2
curl -X POST http://localhost:3000/api/interfaces/ethernet-1/2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{
    "ip": "192.168.2.1/24",
    "description": "to host2"
  }'
```

### 4. Configure host IP address and default routing
```bash
mise run enter-host1
ip addr add 192.168.1.2/24 dev eth1
ip link set eth1 up
ip route replace default via 192.168.1.1

mise run enter-host2
ip addr add 192.168.2.2/24 dev eth1
ip link set eth1 up
ip route replace default via 192.168.2.1
```

### 5. Configure connected routing (bind interfaces)
```bash
curl -X POST http://localhost:3000/api/routes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{
    "interfaces": ["ethernet-1/1", "ethernet-1/2"]
  }'
```

### 6. View interfaces
```bash
curl -X GET http://localhost:3000/api/interfaces \
  -H "Authorization: Bearer <your_token>"
```

### 7. View connected routes
```bash
curl -X GET http://localhost:3000/api/routes \
  -H "Authorization: Bearer <your_token>"
```

## Default Users

| Username | Password  | Role     | Permissions               |
|----------|-----------|----------|---------------------------|
| admin    | admin123  | admin    | Full access               |
| operator | operator123 | operator| Read + Write              |
| readonly | readonly123 | readonly| Read-only                 |

## API Endpoints

### Authentication

- `POST /api/auth/login` - Login and get JWT token
- `POST /api/auth/logout` - Logout and invalidate token
- `GET /api/auth/me` - Get current user info

### Router Configuration

- `POST /api/config/router` - Configure router connection (required before using interfaces/routes)
- `GET /api/config/router` - Get current router configuration
- `DELETE /api/config/router` - Clear router configuration

**Example: Configure router**
```bash
curl -X POST http://localhost:3000/api/config/router \
  -H "Content-Type: application/json" \
  -d '{
    "ip": "172.20.20.2",
    "port": 57400,
    "user": "admin",
    "pass": "NokiaSrl1!"
  }'
```

**Default Router Credentials (Containerlab):**
| Setting | Value |
|---------|-------|
| IP | 172.20.20.2 |
| Port | 57400 |
| Username | admin |
| Password | NokiaSrl1! |

### Interfaces

- `GET /api/interfaces` - Get all interface configurations
- `GET /api/interfaces/:name` - Get specific interface configuration
- `POST /api/interfaces/:name` - Configure an interface (IP, description, admin-state, MTU)

**Example: Configure interface**
```bash
curl -X POST http://localhost:3000/api/interfaces/ethernet-1/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{
    "ip": "192.168.1.1/24",
    "description": "to host1"
  }'
```

### Routing

- `GET /api/routes` - Get connected routes
- `POST /api/routes` - Configure connected routing (bind interfaces to network-instance)
- `DELETE /api/routes` - Clear all routing (unbind all interfaces)

**Example: Configure connected routing**
```bash
curl -X POST http://localhost:3000/api/routes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{
    "interfaces": ["ethernet-1/1", "ethernet-1/2"]
  }'
```

### Audit

- `GET /api/audit-logs` - Get audit logs (all users can view)
- `GET /api/config-history` - Get configuration history (all users can view)

**Query Parameters (optional):**
- `action` - Filter by action (e.g., `get_interfaces`, `configure_route`)
- `resource_type` - Filter by resource type (e.g., `interface`, `route`)
- `limit` - Number of results to return (default: 100)
- `offset` - Number of results to skip (default: 0)

### Health

- `GET /api/health` - API and database health check
- `GET /api/health/router` - Router connectivity check (ping)
- `GET /api/health/router/gnmi` - gNMI port connectivity and capabilities

## Environment Variables

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=3600

# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/network_gateway

# gNMI Configuration (Nokia SR Linux)
GNMI_HOST=172.20.20.2
GNMI_PORT=57400
GNMI_USERNAME=admin
GNMI_PASSWORD=NokiaSrl1!
GNMI_INSECURE=true

# Mock Mode (for development without router)
MOCK_MODE=false
```

## Development with Mock Mode

Set `MOCK_MODE=true` in your `.env` file to use mock data instead of connecting to a real router. This is useful for development and testing.

## gNMI Commands Reference

### Check gNMI Capabilities
```bash
gnmic -a 172.20.20.2:57400 -u admin -p NokiaSrl1! --skip-verify capabilities
```

### Get All Interfaces
```bash
gnmic -a 172.20.20.2:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface' --encoding json_ietf
```

### Get Specific Interface
```bash
gnmic -a 172.20.20.2:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface[name=ethernet-1/1]' --encoding json_ietf
```

### Get Interface IP Address
```bash
gnmic -a 172.20.20.2:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface[name=ethernet-1/1]/subinterface[index=0]/ipv4/address' --encoding json_ietf
```

### Configure Interface IP Address (requires delete then update)
```bash
# Delete existing IP
gnmic -a 172.20.20.2:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --delete "/interface[name=ethernet-1/1]/subinterface[index=0]/ipv4/address"

# Add new IP
gnmic -a 172.20.20.2:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --update-path "/interface[name=ethernet-1/1]/subinterface[index=0]/ipv4/address[ip-prefix=192.168.1.1/24]" \
  --update-value '{}'
```

### Configure Interface Description
```bash
gnmic -a 172.20.20.2:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --update-path "/interface[name=ethernet-1/1]/description" \
  --update-value '"My Interface Description"'
```

### Configure Interface Admin State
```bash
gnmic -a 172.20.20.2:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --update-path "/interface[name=ethernet-1/1]/admin-state" \
  --update-value '"disable"'
```

### Configure Interface MTU
```bash
gnmic -a 172.20.20.2:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --update-path "/interface[name=ethernet-1/1]/mtu" \
  --update-value '9000'
```

## mise Tasks

```bash
mise db-up      # Start PostgreSQL
mise db-down    # Stop PostgreSQL
mise db-reset   # Reset database
mise migrate    # Run migrations
mise seed       # Seed database
mise dev        # Start development server
mise build      # Build for production
mise start      # Start production server
mise test       # Run tests
```

## Project Structure

```
backend/src/
├── config/
│   └── index.ts           # Configuration
├── db/
│   ├── index.ts           # Database connection
│   ├── migrate.ts         # Migration script
│   └── seed.ts            # Seed script
├── routes/
│   ├── index.ts           # Routes aggregator
│   ├── auth.routes.ts     # Authentication routes
│   ├── interface.routes.ts
│   ├── routing.routes.ts
│   ├── audit.routes.ts    # Audit logs and config history routes
│   └── health.routes.ts   # Health check routes
├── services/
│   ├── network-service.ts # Main service layer
│   ├── gnmi-client.ts     # gNMI client for Nokia SR Linux
│   └── mock-data.ts       # Mock data for development
├── types/
│   └── index.ts           # TypeScript type definitions
├── utils/
│   └── crypto.ts          # Cryptographic utilities
└── index.ts               # Application entry point
```

## Interface Response Format

```json
{
  "interfaces": [
    {
      "name": "ethernet-1/1",
      "ip": "172.16.0.1/16",
      "admin_state": "enable",
      "oper_state": "up",
      "description": "WAN Interface",
      "mtu": 9232,
      "port_speed": "25G"
    }
  ]
}
```

## Configure Interface Request

```json
{
  "ip": "172.16.0.1/16",
  "description": "WAN Interface",
  "admin_state": "enable",
  "mtu": 9232
}
```
