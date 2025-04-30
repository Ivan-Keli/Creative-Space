# CreativeSpace System Installation Guide

## Installation Process

### Step 1: Download and Install XAMPP
1. Go to https://www.apachefriends.org
2. Download the XAMPP version for your operating system (Windows/macOS/Linux)
3. Run the installer and follow the prompts (use default settings)
4. Once installed, open the XAMPP Control Panel

### Step 2: Configure the Database
1. In the XAMPP Control Panel, start Apache and MySQL services by clicking the "Start" buttons
2. Wait until both services show a green status indicator
3. Click "Admin" next to MySQL to open phpMyAdmin in your browser
4. Create a new database named creativespace_db:
   - Click on "New" in the left sidebar
   - Enter "creativespace_db" in the database name field
   - Click "Create"
5. Import the database structure:
   - Select the creativespace_db from the left panel
   - Click the "Import" tab at the top
   - Click "Choose File" and select the creativespace_db.sql file
   - Click "Go" at the bottom to import the database structure

### Step 3: Install Node.js
1. Go to https://nodejs.org
2. Download the LTS (Long-Term Support) version
3. Run the installer and follow the prompts
4. Verify the installation by opening Command Prompt or Terminal and typing:
   ```
   node -v
   npm -v
   ```
   You should see version numbers displayed for both commands

### Step 4: Start the Backend Server
1. Open Command Prompt or Terminal as administrator
2. Navigate to the project directory:
   ```
   cd C:\Projects\creativespace
   ```
3. Start the server:
   ```
   node server.js
   ```
4. You should see a message indicating the server is running at http://localhost:5000

### Step 5: Start the Frontend Application
1. Open a new Command Prompt or Terminal window as administrator
2. Navigate to the frontend directory:
   ```
   cd C:\Projects\creativespace\frontend
   ```
3. Start the React application:
   ```
   npm start
   ```
4. Your default web browser should automatically open with the application running at http://localhost:3000

## Troubleshooting

### If Apache or MySQL won't start:
- Check if other applications are using ports 80 or 3306
- Try stopping and restarting the services
- Check XAMPP logs for specific error messages

### If the backend server fails to start:
- Ensure MySQL is running
- Verify the database connection settings in the server configuration
- Check if required dependencies are installed with:
  ```
  cd C:\Projects\creativespace
  npm install
  ```

### If the frontend fails to start:
- Ensure you have the correct package.json file with all dependencies
- Open cmd and run:
  ```
  cd C:\Projects\creativespace\frontend
  npm install
  ```
- This is to install any missing dependencies
- Check console for specific error messages
