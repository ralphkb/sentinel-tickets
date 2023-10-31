// Import necessary modules
const { Client, GatewayIntentBits, Collection, AttachmentBuilder, ActivityType } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const packageJson = require('./package.json');
const { QuickDB } = require("quick.db");
const discordHtmlTranscripts = require('discord-html-transcripts');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const yaml = require('yaml');
const configFile = fs.readFileSync('./config.yml', 'utf8');
const config = yaml.parse(configFile);

// Check if the data directory exists, and if not, create it
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const mainDB = new QuickDB({ filePath: "data/main.sqlite" });
const ticketsDB = new QuickDB({ filePath: "data/tickets.sqlite" });

(async function() {
	// Initialize totalTickets to 0 if it doesn't exist
	if (!(await mainDB.has('totalTickets'))) {
	  await mainDB.set('totalTickets', 1);
	}
  
	// Initialize openTickets to an empty array if it doesn't exist
	if (!(await mainDB.has('openTickets'))) {
	  await mainDB.set('openTickets', []);
	}
  
	// Initialize blacklistedUsers to an empty array if it doesn't exist
	if (!(await mainDB.has('blacklistedUsers'))) {
	  await mainDB.set('blacklistedUsers', []);
	}
  })();

// Extract information from the config.yml to properly setup the ticket categories
const ticketCategories = [];

config.TicketCategories.forEach((category) => {
  const { id, name, categoryID, closedCategoryID, buttonEmoji, buttonLabel, buttonStyle, embedTitle, color, description, ticketName, modalTitle, questions } = category;

  const extractedQuestions = questions.map((question) => {
	const { label, placeholder, style, required, minLength } = question;

	return {
	  label,
	  placeholder,
	  style,
	  required,
	  minLength,
	};
  });

  ticketCategories[id] = {
	name,
	categoryID,
	closedCategoryID,
	buttonEmoji,
	buttonLabel,
	buttonStyle,
	embedTitle,
	color,
	description,
	ticketName,
	modalTitle,
	questions: extractedQuestions,
  };
});

async function saveTranscript(interaction, message) {
	const createTranscriptOptions = {
	  limit: -1,
	  saveImages: false,
	  returnType: 'buffer',
	  poweredBy: false
	};
  
	let channel;
	if (interaction) {
	  channel = interaction.channel;
	} else if (message) {
	  channel = message.channel;
	}
  
	if (channel) {
	  const fileName = `${channel.name}-transcript.html`;
	  const attachmentBuffer = await discordHtmlTranscripts.createTranscript(channel, {
		...createTranscriptOptions,
		fileName
	  });
	  return new AttachmentBuilder(Buffer.from(attachmentBuffer), { name: fileName });
	}
  
	return null;
  }

// Logging function for future use  
  async function logMessage(message) {
	const date = new Date();
	const options = {
	  timeZoneName: 'short',
	  hour: 'numeric',
	  minute: 'numeric',
	  second: 'numeric',
	  hour12: true
	};
  
	const timeString = date.toLocaleString('en-US', options);
	const logMessage = `[${timeString}] [Bot v${packageJson.version}] [NodeJS ${process.version}] [LOG] ${message}\n\n`;
  
	try {
	  await fs.promises.appendFile("./logs.txt", logMessage);
	} catch (err) {
	  console.log('Error writing to log file:', err);
	}
  }

// Sanitizing function for future use  
  async function sanitizeInput(input) {
	const formattingCharacters = ['_', '*', '`', '~', '|', '-'];
	const escapedInput = input.replace(new RegExp(`[${formattingCharacters.join('')}]`, 'g'), '\\$&');
	return escapedInput;
  }

// Load environment variables
dotenv.config();

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
	],
});

module.exports = {
	client,
	mainDB,
	ticketsDB,
	saveTranscript,
	logMessage,
	ticketCategories,
	sanitizeInput
  };

// Holding commands cooldown data 
client.cooldowns = new Collection();

// Reading event files
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
	const filePath = path.join(eventsPath, file);
	const event = require(filePath);
	if (event.once) {
		client.once(event.name, (...args) => event.execute(...args));
	} else {
		client.on(event.name, (...args) => event.execute(...args));
	}
}

// Error handlers

// Function to log errors
async function logError(errorType, error) {
	const date = new Date();
	const options = {
	  timeZoneName: 'short',
	  hour: 'numeric',
	  minute: 'numeric',
	  second: 'numeric',
	  hour12: true
	};

	const timeString = date.toLocaleString('en-US', options);
	const errorMessage = `[${timeString}] [Bot v${packageJson.version}] [NodeJS ${process.version}] [${errorType}]\n${error.stack}\n\n`;
  
	try {
	  await fs.promises.appendFile("./logs.txt", errorMessage);
	} catch (err) {
	  console.log('Error writing to log file:', err);
	}
  }

client.on('warn', async (error) => {
  console.log(error);
  logError('WARN', error);
});

client.on('error', async (error) => {
  console.log(error);
  logError('ERROR', error);
});

process.on('unhandledRejection', async (error) => {
  console.log(error);
  logError('unhandledRejection', error);
})

process.on('uncaughtException', async (error) => {
  console.log(error);
  logError('uncaughtException', error);
})

client.commands = new Collection();
const commands = [];
const commandFolders = fs.readdirSync('./commands');
for (const folder of commandFolders) {
  const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {

  const command = require(`./commands/${folder}/${file}`);
if(command.enabled) {
  commands.push(command.data.toJSON());
  console.log(`The slash command [${file}] has been loaded!`);
  client.commands.set(command.data.name, command);
}
}
}


client.on('ready', async () => {
	try {
	  const rest = new REST({
		version: '10'
	}).setToken(process.env.BOT_TOKEN);

	(async () => {
		try {
		  // Get the previously registered slash commands
		  const registeredCommands = await rest.get(
			Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
		  );
	  
		  // Filter out the new slash commands that are not already registered
		  const newCommands = commands.filter((command) => {
			return !registeredCommands.some((registeredCommand) => {
			  return registeredCommand.name === command.name;
			});
		  });
	  
		  // Filter out the existing slash commands that are not in the new commands
		  const removedCommands = registeredCommands.filter((registeredCommand) => {
			return !commands.some((command) => {
			  return command.name === registeredCommand.name;
			});
		  });
	  
		  // Register the new slash commands if there are any
		  if (newCommands.length > 0) {
			await rest.put(
			  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
			  {
				body: commands,
			  }
			);
	  
			console.log('New slash commands registered successfully.');
			console.log(commands.map((command) => command.name));
		  } else {
			console.log('No new slash commands to register.');
		  }
	  
		  // Remove the existing slash commands if there are any
		  if (removedCommands.length > 0) {
			await Promise.all(
			  removedCommands.map((command) =>
				rest.delete(
				  Routes.applicationGuildCommand(process.env.CLIENT_ID, process.env.GUILD_ID, command.id)
				)
			  )
			);
	  
			console.log('Existing slash commands removed successfully.');
			console.log(removedCommands.map((command) => command.name));
		  } else {
			console.log('No existing slash commands to remove.');
		  }
		} catch (error) {
			if (error) {
				console.log(`The bot was invited with some missing options. Please use the link below to re-invite your bot.`)
				console.log(`https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=268823632&scope=bot%20applications.commands`)
			  }
		}
	  })();

	  const presence = {
		activities: [
		  {
			name: config.status.botActivityText,
			type: ActivityType[config.status.botActivityType]
		  }
		],
		status: config.status.botStatus
	  };
	  
	  if (config.status.botActivityType === "Streaming") {
		presence.activities[0].url = config.status.streamingOptionURL;
	  }
	  
	  client.user.setPresence(presence);
	  console.log(`The ticket bot is now ready! Logged in as ${client.user.tag}`);

	} catch (error) {
	  console.error('An error occurred during initialization:', error);
	}
  });

// Log in to Discord with your app's token
client.login(process.env.BOT_TOKEN).catch(error => {
    if (error.message.includes("An invalid token was provided")) {
	  console.log(error);	
	  logError('INVALID_TOKEN', error);
      process.exit();
    } else if(error.message.includes("Privileged intent provided is not enabled or whitelisted.")){
	  console.log(error);	
	  logError('DISALLOWED_INTENTS', error);
      process.exit();
    } else {
	  console.log(error);
      logError('ERROR', error);
      process.exit();
    }
  });