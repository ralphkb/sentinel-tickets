const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { mainDB, ticketsDB, ticketCategories, client } = require("../init.js");
const {
  configEmbed,
  sanitizeInput,
  logMessage,
  getChannel,
} = require("./mainUtils.js");

async function unclaimTicket(interaction) {
  const totalClaims = await mainDB.get("totalClaims");
  const ticketButton = await ticketsDB.get(`${interaction.channel.id}.button`);
  const category = ticketCategories[ticketButton];

  category.support_role_ids.forEach(async (roleId) => {
    await interaction.channel.permissionOverwrites
      .edit(roleId, {
        SendMessages: true,
        ViewChannel: true,
      })
      .catch((error) => {
        console.error(`Error updating permissions:`, error);
      });
  });

  const defaultValues = {
    color: "#FF2400",
    title: "Ticket Unclaimed",
    description: `This ticket has been unclaimed by {user}.`,
    timestamp: true,
    footer: {
      text: `Unclaimed by ${interaction.user.tag}`,
      iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const unclaimedEmbed = await configEmbed("unclaimedEmbed", defaultValues);

  if (unclaimedEmbed.data && unclaimedEmbed.data.description) {
    unclaimedEmbed.setDescription(
      unclaimedEmbed.data.description.replace(/\{user\}/g, interaction.user),
    );
  }

  await interaction.editReply({
    content: "You successfully unclaimed this ticket!",
    ephemeral: true,
  });
  await interaction.channel.permissionOverwrites.delete(interaction.user);
  await interaction.channel.send({ embeds: [unclaimedEmbed] });

  await interaction.channel.messages
    .fetch(await ticketsDB.get(`${interaction.channel.id}.msgID`))
    .then(async (message) => {
      const embed = message.embeds[0];
      embed.fields.pop();
      let actionRow3 = new ActionRowBuilder();

      if (config.ticketOpenEmbed.useMenu) {
        const options = [];

        const closeOption = new StringSelectMenuOptionBuilder()
          .setLabel(config.closeButton.label)
          .setDescription(config.ticketOpenEmbed.closeDescription)
          .setValue("closeTicket")
          .setEmoji(config.closeButton.emoji);
        options.push(closeOption);

        const claimOption = new StringSelectMenuOptionBuilder()
          .setLabel(config.claimButton.label)
          .setDescription(config.ticketOpenEmbed.claimDescription)
          .setValue("ticketclaim")
          .setEmoji(config.claimButton.emoji);
        options.push(claimOption);

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("ticketOpenMenu")
          .setPlaceholder(
            config.ticketOpenEmbed.menuPlaceholder || "Select an option",
          )
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(options);

        actionRow3.addComponents(selectMenu);
        await mainDB.set("ticketOpenMenuOptions", {
          options,
          placeholder:
            config.ticketOpenEmbed.menuPlaceholder || "Select an option",
        });
      } else {
        const closeButton = new ButtonBuilder()
          .setCustomId("closeTicket")
          .setLabel(config.closeButton.label)
          .setEmoji(config.closeButton.emoji)
          .setStyle(ButtonStyle[config.closeButton.style]);

        const claimButton = new ButtonBuilder()
          .setCustomId("ticketclaim")
          .setLabel(config.claimButton.label)
          .setEmoji(config.claimButton.emoji)
          .setStyle(ButtonStyle[config.claimButton.style]);

        actionRow3.addComponents(closeButton, claimButton);
      }
      await message.edit({ embeds: [embed], components: [actionRow3] });

      await ticketsDB.set(`${interaction.channel.id}.claimed`, false);
      await ticketsDB.set(`${interaction.channel.id}.claimUser`, "");

      let logChannelId = config.logs.ticketUnclaim || config.logs.default;
      let logsChannel = await getChannel(logChannelId);

      const logDefaultValues = {
        color: "#FF2400",
        title: "Ticket Logs | Ticket Unclaimed",
        timestamp: true,
        thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        footer: {
          text: `${interaction.user.tag}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const logUnclaimedEmbed = await configEmbed(
        "logUnclaimedEmbed",
        logDefaultValues,
      );

      logUnclaimedEmbed.addFields([
        {
          name: config.logUnclaimedEmbed.field_staff,
          value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logUnclaimedEmbed.field_staff,
          value: `> <#${interaction.channel.id}>\n> #${sanitizeInput(interaction.channel.name)}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
        },
      ]);

      if (config.toggleLogs.ticketUnclaim) {
        try {
          await logsChannel.send({ embeds: [logUnclaimedEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }
      await mainDB.set("totalClaims", totalClaims - 1);
      logMessage(
        `${interaction.user.tag} unclaimed the ticket #${interaction.channel.name}`,
      );
    });
}

module.exports = {
  unclaimTicket,
};
