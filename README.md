# Sentinel Tickets Discord Bot

## Introduction
This is a ticket bot that aims to provide a free and open source solution for managing tickets on Discord. The bot is designed to be lightweight, without any watermarks or unnecessary bloat. It allows users to create, track, and manage tickets seamlessly.

## Requirements
- Tested on latest Node.js v18

## Table of Contents
- [🛠️ Installation](#installation)
- [✨ Features](#features)
- [📚 Documentation](#documentation)
- [🐛 Bug Reporting](#bug-reporting)
- [📃 License](#license)

## Installation
1. Install Node.js if not already installed (v18 recommended): [Node.js Installation Guide](https://nodejs.org/en/download/)
2. Clone the repository: `git clone https://github.com/ralphkb/sentinel-tickets.git`
3. Change to the project directory, for example: `cd ticket-bot-project`
4. Run `npm install` to install the dependencies
5. Rename .env.example to .env and config.yml.example to config.yml
6. Open .env file and fill it with your bot's token, guild ID and client ID
7. Open config.yml to configure the settings and messages to your liking, make sure to properly configure the ticket categories
8. Start the bot: `npm start`

## Features

- Up to 25 Categories: Organize support requests in different categories.
- Intuitive Ticket Panel: Create and manage tickets with ease using buttons or a select menu.
- Modal Questions: Gather necessary information before opening a ticket.
- Configuration to customize many of the messages and options.
- Option to configure the amount of max opened tickets at one time.
- Ticket claiming feature that can be turned on/off.
- Automatic saving of transcripts upon ticket deletion and force deletion.
- Option to manually save a transcript with images downloaded, use with caution as it increases the transcript size.
- Option to DM users on ticket deletion with their transcript and an embed with useful information.
- Option to select Transcript type, can be HTML or TXT however HTML is recommended.
- Ticket logs for multiple ticket events, such as ticket create, close, delete, force delete, reopen, claim, unclaim etc.
- Precise and organized logs of errors and all ticket events in a logs.txt file.
- Option to ping support roles on ticket creation.
- Option to edit the activity of the bot.
- Multiple Commands: Efficiently manage tickets with various commands.
    - Send the tickets panel in any channel
    - Add Users or Roles to a ticket
    - Remove Users or Roles from a ticket
    - Rename Ticket Channel
    - Alert Ticket Creator
    - Close Ticket to archive them until deleting them
    - Delete Tickets
    - Blacklist Users or Roles
    - Save Transcripts
    - Claim/Unclaim Tickets
    - Move tickets to another category
    - Pin tickets in a category
    - Add a custom slowmode to a ticket

## Documentation
The Wiki will be improved over time and can be found here: https://github.com/ralphkb/sentinel-tickets/wiki

## Bug Reporting
- For bug reports, open an issue [here](https://github.com/ralphkb/sentinel-tickets/issues).  
This is a free project that I enjoy working on in my free time, I cannot guarantee support however I will try my best to fix bugs and sort out issues. As my first public project for the open source community, I am still learning and improving, thank you for your understanding! 😄

## License
This project is licensed under the [MIT License](LICENSE).