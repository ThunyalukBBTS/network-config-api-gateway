# Network API Gateway

REST API Gateway for Cisco ISR4321 router management using gNMI/NETCONF protocols.

## Features

- **Authentication**: JWT-based authentication with role-based access control
- **Interfaces**: View and configure network interfaces
- **Routing**: Configure static routes, OSPF, BGP, and EIGRP
- **Firewall**: Manage firewall rules
- **Audit Logging**: Track all configuration changes
- **Mock Mode**: Development without physical router

## Tech Stack

- **Framework**: Elysia (Bun/TypeScript)
- **Database**: PostgreSQL
- **Authentication**: JWT with bcrypt
- **Documentation**: Swagger/OpenAPI
- **Southbound**: gNMI/NETCONF (Cisco IOS XE)

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) >= 1.1.0
- [Docker](https://www.docker.com/) (for PostgreSQL)
- [mise](https://mise.jdx.dev/) (task runner, optional)

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
bun src/db/migrate.ts
```

5. Seed database with default users:
```bash
mise seed
# or
bun src/db/seed.ts
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
bun --watch src/index.ts
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
- `POST /api/interfaces` - Configure an interface

### Routing

- `GET /api/routes` - Get routing table
- `GET /api/routes/:protocol` - Get routes by protocol
- `POST /api/routes` - Configure routing (Static, OSPF, BGP, EIGRP)
- `DELETE /api/routes` - Delete a route

### Firewall

- `GET /api/firewall` - Get all firewall rules
- `POST /api/firewall` - Configure a firewall rule
- `DELETE /api/firewall/:ruleId` - Delete a firewall rule

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

# gNMI Configuration
GNMI_HOST=192.168.1.1
GNMI_PORT=9339
GNMI_USERNAME=admin
GNMI_PASSWORD=admin
GNMI_INSECURE=true

# NETCONF Configuration
NETCONF_HOST=192.168.1.1
NETCONF_PORT=830
NETCONF_USERNAME=admin
NETCONF_PASSWORD=admin

# Mock Mode (for development without router)
MOCK_MODE=true
```

## Development with Mock Mode

Set `MOCK_MODE=true` in your `.env` file to use mock data instead of connecting to a real router. This is useful for development and testing.

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
src/
├── config/
│   └── index.ts           # Configuration
├── db/
│   ├── index.ts           # Database connection
│   ├── migrate.ts         # Migration script
│   └── seed.ts            # Seed script
├── middleware/
│   └── auth.ts            # Authentication middleware
├── routes/
│   ├── index.ts           # Routes aggregator
│   ├── auth.routes.ts     # Authentication routes
│   ├── interface.routes.ts
│   ├── routing.routes.ts
│   └── firewall.routes.ts
├── services/
│   ├── network-service.ts # Main service layer
│   ├── gnmi-client.ts     # gNMI client (placeholder)
│   ├── netconf-client.ts  # NETCONF client (placeholder)
│   └── mock-data.ts       # Mock data for development
├── types/
│   └── index.ts           # TypeScript type definitions
├── utils/
│   └── crypto.ts          # Cryptographic utilities
└── index.ts               # Application entry point
```

## YANG Models

YANG models for Cisco IOS XE 16.9.3 are available at:
https://github.com/YangModels/yang/tree/main/vendor/cisco/xe/1693
