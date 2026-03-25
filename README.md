# Network API Gateway

REST API Gateway for network router management using gNMI protocol with Nokia SR Linux devices.

## Features

- **Authentication**: JWT-based authentication with role-based access control
- **Interfaces**: View and configure network interfaces (IP, description, admin-state, MTU)
- **Routing**: Configure static routes, OSPF, BGP, and EIGRP
- **Firewall**: Manage firewall rules
- **Audit Logging**: Track all configuration changes
- **Mock Mode**: Development without physical router

## Tech Stack

- **Framework**: Elysia (Bun/TypeScript)
- **Database**: PostgreSQL
- **Authentication**: JWT with bcrypt
- **Documentation**: Swagger/OpenAPI
- **Southbound**: gNMI (Nokia SR Linux)

## Quick Start

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
bun install
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
cp .env.example .env
# Edit .env with your settings
```

7. Start the server:
```bash
mise dev
# or
bun --watch backend/src/index.ts
```

The API will be available at `http://localhost:3000`

## API Documentation

Once the server is running, visit `http://localhost:3000/docs` for interactive Swagger documentation.

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

### Interfaces

- `GET /api/interfaces` - Get all interface configurations
- `GET /api/interfaces/:name` - Get specific interface configuration
- `POST /api/interfaces/:name` - Configure an interface (IP, description, admin-state, MTU)

### Routing

- `GET /api/routes` - Get routing table
- `POST /api/routes` - Configure routing (Static, OSPF, BGP, EIGRP)
- `DELETE /api/routes` - Delete a route

### Firewall

- `GET /api/firewall` - Get all firewall rules
- `POST /api/firewall` - Configure a firewall rule
- `DELETE /api/firewall/:ruleId` - Delete a firewall rule

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
GNMI_HOST=172.20.20.4
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
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify capabilities
```

### Get All Interfaces
```bash
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface' --encoding json_ietf
```

### Get Specific Interface
```bash
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface[name=ethernet-1/1]' --encoding json_ietf
```

### Get Interface IP Address
```bash
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify get \
  --path '/interface[name=ethernet-1/1]/subinterface[index=0]/ipv4/address' --encoding json_ietf
```

### Configure Interface IP Address (requires delete then update)
```bash
# Delete existing IP
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --delete "/interface[name=ethernet-1/1]/subinterface[index=0]/ipv4/address"

# Add new IP
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --update-path "/interface[name=ethernet-1/1]/subinterface[index=0]/ipv4/address[ip-prefix=192.168.1.1/24]" \
  --update-value '{}'
```

### Configure Interface Description
```bash
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --update-path "/interface[name=ethernet-1/1]/description" \
  --update-value '"My Interface Description"'
```

### Configure Interface Admin State
```bash
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify set \
  --update-path "/interface[name=ethernet-1/1]/admin-state" \
  --update-value '"disable"'
```

### Configure Interface MTU
```bash
gnmic -a 172.20.20.4:57400 -u admin -p NokiaSrl1! --skip-verify set \
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
│   ├── firewall.routes.ts
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
