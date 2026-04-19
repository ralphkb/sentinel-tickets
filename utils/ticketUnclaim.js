const {
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  MessageFlags,
} = require("discord.js");
const { mainDB, ticketsDB, ticketCategories, client } = require("../init.js");
const {
  configEmbed,
  sanitizeInput,
  logMessage,
  getChannel,
  getUser,
} = require("./mainUtils.js");

async function unclaimTicket(interaction, targetUser, reason) {
  const claimUserID = await ticketsDB.get(
    `${interaction.channel.id}.claimUser`,
  );
  const staffUser = targetUser || (await getUser(claimUserID));
  const isForcedUnclaim = staffUser.id !== interaction.user.id;

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
    title: isForcedUnclaim ? "Ticket Unclaimed (Forced)" : "Ticket Unclaimed",
    description: isForcedUnclaim
      ? `This ticket has been unclaimed from {user} by ${interaction.user}.\nReason: **${reason || "No reason provided"}**`
      : `This ticket has been unclaimed by {user}.`,
    timestamp: true,
    footer: {
      text: `Unclaimed by ${interaction.user.tag}`,
      iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const unclaimedEmbed = await configEmbed(
    isForcedUnclaim ? "unclaimedForcedEmbed" : "unclaimedEmbed",
    defaultValues,
  );

  if (unclaimedEmbed.data && unclaimedEmbed.data.description) {
    unclaimedEmbed.setDescription(
      unclaimedEmbed.data.description
        .replace(/\{user\}/g, staffUser)
        .replace(/\{reason\}/g, reason || "No reason provided")
        .replace(/\{unclaimer\}/g, interaction.user),
    );
  }
  if (isForcedUnclaim) {
    unclaimedEmbed.setFooter({
      text: `Unclaimed by ${interaction.user.tag}`,
      iconURL: interaction.user.displayAvatarURL({
        extension: "png",
        size: 1024,
      }),
    });
  }

  await interaction.editReply({
    content: isForcedUnclaim
      ? `You successfully unclaimed this ticket from **${staffUser.tag}**!`
      : "You successfully unclaimed this ticket!",
    flags: MessageFlags.Ephemeral,
  });
  await interaction.channel.permissionOverwrites.delete(staffUser);
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
        title: isForcedUnclaim
          ? "Ticket Logs | Ticket Unclaimed (Forced)"
          : "Ticket Logs | Ticket Unclaimed",
        timestamp: true,
        thumbnail: `${staffUser.displayAvatarURL({ extension: "png", size: 1024 })}`,
        footer: {
          text: `${staffUser.tag}`,
          iconURL: `${staffUser.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const logUnclaimedEmbed = await configEmbed(
        isForcedUnclaim ? "logUnclaimedForcedEmbed" : "logUnclaimedEmbed",
        logDefaultValues,
      );

      logUnclaimedEmbed.addFields([
        {
          name:
            (isForcedUnclaim
              ? config.logUnclaimedForcedEmbed.field_staff
              : config.logUnclaimedEmbed.field_staff) || "• Staff",
          value: `> <@!${staffUser.id}>\n> ${sanitizeInput(staffUser.tag)}`,
        },
        {
          name:
            (isForcedUnclaim
              ? config.logUnclaimedForcedEmbed.field_ticket
              : config.logUnclaimedEmbed.field_ticket) || "• Ticket",
          value: `> <#${interaction.channel.id}>\n> #${sanitizeInput(interaction.channel.name)}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
        },
      ]);

      if (isForcedUnclaim) {
        logUnclaimedEmbed.addFields([
          {
            name:
              config.logUnclaimedForcedEmbed.field_unclaimer ||
              "• Unclaimed By",
            value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
          },
          {
            name: config.logUnclaimedForcedEmbed.field_reason || "• Reason",
            value: `> ${reason || "No reason provided"}`,
          },
        ]);
      }

      if (config.toggleLogs.ticketUnclaim) {
        try {
          await logsChannel.send({ embeds: [logUnclaimedEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }
      await mainDB.sub("totalClaims", 1);
      await logMessage(
        isForcedUnclaim
          ? `${interaction.user.tag} forcefully unclaimed the ticket #${interaction.channel.name} from ${staffUser.tag}`
          : `${interaction.user.tag} unclaimed the ticket #${interaction.channel.name}`,
      );
    });
}

module.exports = {
  unclaimTicket,
};
