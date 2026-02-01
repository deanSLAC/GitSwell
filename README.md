# Git Contrib

A GitHub-style contribution heatmap for your local git repositories. Visualize your coding activity across multiple projects in a beautiful, interactive heatmap.

## Features

- **Dynamic Repository Scanning**: Point to any directory and automatically discover all git repositories
- **Per-Repository Colors**: Each repository gets a unique color on the heatmap
- **Repository Management**: Ignore/include specific repositories from the heatmap
- **Top Repositories**: See your most active repositories for each year
- **Focus Mode**: Double-click a repository to view only its contributions
- **Hide/Show**: Click repositories to temporarily hide them from the heatmap
- **Day Details**: Click any day to see detailed commit information
- **Year Navigation**: Browse contributions by year

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.6+

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/git-contrib.git
cd git-contrib

# Install dependencies
npm install

# Start the server
npm start
```

Then open http://localhost:3000 in your browser.

### Development Mode

```bash
# Start Vite dev server with hot reload
npm run dev
```

Note: In development mode, you'll need to run the Express server separately for API endpoints:
```bash
node server.js
```

## Usage

1. **Enter your projects directory**: On first launch, enter the path to a directory containing your git repositories (e.g., `~/projects` or `~/code`).

2. **Scan for repositories**: The scanner will recursively find all git repositories up to 3 levels deep.

3. **View your contributions**: The heatmap shows your commit activity. Brighter colors = more commits.

4. **Manage repositories**: Click "Repositories" in the header to:
   - Ignore repositories you don't want in the heatmap (like cloned dependencies)
   - Change repository colors
   - Search and filter repositories

5. **Interact with the heatmap**:
   - Click any day to see commit details
   - Click top repositories to hide/show them
   - Double-click a repository to focus on just that repo

## Architecture

- **Frontend**: React + Vite
- **Backend**: Express.js
- **Database**: SQLite (via better-sqlite3)
- **Parser**: Python script for git log extraction

### Data Storage

All data is stored in `data/commits.db` (SQLite database), which is gitignored. This includes:
- Commit history
- Repository metadata
- User preferences (ignored repos, colors)

## Configuration

The app stores configuration in the SQLite database. No config files needed!

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Get configuration |
| `/api/config` | POST | Set configuration |
| `/api/repos` | GET | List all repositories |
| `/api/repos/:id` | PATCH | Update repository (ignore, color) |
| `/api/commits` | GET | Get commits (with optional filters) |
| `/api/years` | GET | Get years with data |
| `/api/top-repos/:year` | GET | Get top repos for a year |
| `/api/parse` | POST | Run the repository parser |
| `/api/stats` | GET | Get contribution statistics |

## License

MIT
