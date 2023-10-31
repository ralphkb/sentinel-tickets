# Sentinel Tickets Discord Bot Project

## Introduction
This is a ticket bot project that aims to provide a free and open source solution for managing tickets on Discord. The bot is designed to be lightweight, without any watermarks or unnecessary bloat. It allows users to create, track, and manage tickets seamlessly.

## Requirements
- Tested on latest Node.js v18

## Table of Contents
- [🛠️ Installation](#installation)
- [✨ Features](#features)
- [💻 Usage](#usage)
- [📚 Documentation](#documentation)
- [🐛 Bug Reporting](#bug-reporting)
- [📃 License](#license)

## 🛠️ Installation
1. Install Node.js if not already installed (v18 recommended): [Node.js Installation Guide](https://nodejs.org/en/download/)
2. Clone the repository: `git clone https://github.com/ralphkb/sentinel-tickets.git`
3. Change to the project directory, for example: `cd ticket-bot-project`
4. Run `npm install` to install the dependencies
5. Rename .env.example to .env and config.yml.example to config.yml

## ✨ Features

- Multiple Categories: Organize support requests in different categories.
- Intuitive Ticket Panel: Create and manage tickets with ease using buttons, select menu will be added in the future at some point.
- Modal Questions: Gather necessary information before opening a ticket.
- Configuration to customize many of the messages and options.
- Option to configure the amount of max opened tickets at one time.
- Ticket claiming feature that can be turned on/off.
- Ticket transcripts.
- Ticket logs for multiple ticket events, such as ticket create, close, delete, force delete, reopen, claim, unclaim etc.
- Option to ping support roles on ticket creation.
- Option to edit the activity of the bot.
- Multiple Commands: Efficiently manage tickets with various commands.
    - Send the tickets panel in any channel
    - Add User to a ticket
    - Remove User from a ticket
    - Rename Ticket Channel
    - Alert Ticket Creator
    - Close Ticket to archive them until deleting them
    - Delete Tickets
    - Blacklist Users

## 💻 Usage
1. Open .env file and fill it with your bot's token, guild ID and client ID
2. Open config.yml to configure the settings and messages to your liking, make sure to properly configure the ticket categories
3. Start the bot: `npm start`

## 📚 Documentation
This project is still new, a wiki/documentation for it will be released in the future.

## 🐛 Bug Reporting
- For bug reports, open an issue [here](https://github.com/ralphkb/sentinel-tickets/issues).  
This is a free project that I enjoy working on in my free time, I cannot guarantee support however I will try my best to fix bugs and sort out issues. As my first public project for the open source community, I am still learning and improving, thank you for your understanding! 😄

## 📃 License
This project is licensed under the [MIT License](LICENSE).