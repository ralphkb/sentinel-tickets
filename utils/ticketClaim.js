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

async function claimTicket(interaction, targetUser, reason) {
  const staffUser = targetUser || interaction.user;
  const isAssignment = staffUser.id !== interaction.user.id;

  const oldClaimUserID = await ticketsDB.get(
    `${interaction.channel.id}.claimUser`,
  );
  const isReassignment = !!oldClaimUserID && oldClaimUserID !== staffUser.id;

  if (isReassignment) {
    try {
      const oldStaffUser = await getUser(oldClaimUserID);
      if (oldStaffUser) {
        await interaction.channel.permissionOverwrites
          .delete(oldStaffUser)
          .catch(() => {});
      }
    } catch {
      // Ignore if user not found
    }
  }

  const defaultValues = {
    color: "#2FF200",
    title: isAssignment ? "Ticket Assigned" : "Ticket Claimed",
    description: isAssignment
      ? `This ticket has been assigned to {user}.\nReason: **${reason || "No reason provided"}**\n\nThey will be assisting you shortly!`
      : `This ticket has been claimed by {user}.\nThey will be assisting you shortly!`,
    timestamp: true,
    footer: {
      text: isAssignment
        ? `Assigned by ${interaction.user.tag}`
        : `Claimed by ${interaction.user.tag}`,
      iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const claimedEmbed = await configEmbed(
    isAssignment ? "assignedEmbed" : "claimedEmbed",
    defaultValues,
  );

  if (claimedEmbed.data && claimedEmbed.data.description) {
    claimedEmbed.setDescription(
      claimedEmbed.data.description
        .replace(/\{user\}/g, staffUser)
        .replace(/\{reason\}/g, reason || "No reason provided")
        .replace(/\{assigner\}/g, interaction.user.tag),
    );
  }
  if (isAssignment) {
    claimedEmbed.setFooter({
      text: `Assigned by ${interaction.user.tag}`,
      iconURL: interaction.user.displayAvatarURL({
        extension: "png",
        size: 1024,
      }),
    });
  }

  await interaction.editReply({
    content: isAssignment
      ? `You successfully assigned this ticket to **${staffUser.tag}**!`
      : "You successfully claimed this ticket!",
    flags: MessageFlags.Ephemeral,
  });
  await interaction.channel.send({ embeds: [claimedEmbed] });
  await interaction.channel.messages
    .fetch(await ticketsDB.get(`${interaction.channel.id}.msgID`))
    .then(async (message) => {
      const embed = message.embeds[0];
      const claimedByField = {
        name: isAssignment ? "Assigned to" : "Claimed by",
        value: `> <@!${staffUser.id}> (${sanitizeInput(staffUser.tag)})`,
      };

      if (isReassignment) {
        const fieldIndex = embed.fields.findIndex(
          (f) => f.name === "Claimed by" || f.name === "Assigned to",
        );
        if (fieldIndex !== -1) {
          embed.fields[fieldIndex] = claimedByField;
        } else {
          embed.fields.push(claimedByField);
        }
      } else {
        embed.fields.push(claimedByField);
      }
      let actionRow2 = new ActionRowBuilder();

      if (config.ticketOpenEmbed.useMenu) {
        const options = [];

        const closeOption = new StringSelectMenuOptionBuilder()
          .setLabel(config.closeButton.label)
          .setDescription(config.ticketOpenEmbed.closeDescription)
          .setValue("closeTicket")
          .setEmoji(config.closeButton.emoji);
        options.push(closeOption);

        const unclaimOption = new StringSelectMenuOptionBuilder()
          .setLabel(config.unclaimButton.label)
          .setDescription(config.ticketOpenEmbed.unclaimDescription)
          .setValue("ticketunclaim")
          .setEmoji(config.unclaimButton.emoji);
        options.push(unclaimOption);

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId("ticketOpenMenu")
          .setPlaceholder(
            config.ticketOpenEmbed.menuPlaceholder || "Select an option",
          )
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(options);

        actionRow2.addComponents(selectMenu);
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
          .setStyle(ButtonStyle[config.claimButton.style])
          .setDisabled(true);

        const unClaimButton = new ButtonBuilder()
          .setCustomId("ticketunclaim")
          .setLabel(config.unclaimButton.label)
          .setEmoji(config.unclaimButton.emoji)
          .setStyle(ButtonStyle[config.unclaimButton.style]);

        actionRow2.addComponents(closeButton, claimButton, unClaimButton);
      }
      await message.edit({ embeds: [embed], components: [actionRow2] });

      const ticketButton = await ticketsDB.get(
        `${interaction.channel.id}.button`,
      );
      const category = ticketCategories[ticketButton];
      if (config.claimRename) {
        let claimRenameName = config.claimRenameName || "{category}-{username}";
        const claimUsername = staffUser.username;
        let claimDisplayname = staffUser.username;
        try {
          const member = await interaction.guild.members.fetch(staffUser.id);
          claimDisplayname = member.displayName;
        } catch {
          // Ignore
        }

        claimRenameName = claimRenameName
          .replace(/\{category\}/g, category.name)
          .replace(/\{username\}/g, claimUsername)
          .replace(/\{displayname\}/g, claimDisplayname);

        await interaction.channel.setName(claimRenameName);
      }

      if (config.claim1on1) {
        category.support_role_ids.forEach(async (roleId) => {
          await interaction.channel.permissionOverwrites
            .edit(roleId, {
              SendMessages: false,
              ViewChannel: true,
            })
            .catch((error) => {
              console.error(`Error updating permissions:`, error);
            });
        });
      }

      await interaction.channel.permissionOverwrites.edit(staffUser, {
        SendMessages: true,
        ViewChannel: true,
        AttachFiles: true,
        EmbedLinks: true,
        ReadMessageHistory: true,
      });

      await ticketsDB.set(`${interaction.channel.id}.claimed`, true);
      await ticketsDB.set(`${interaction.channel.id}.claimUser`, staffUser.id);

      // Update the channel topic with claim status if enabled
      if (
        config.claimFeature !== false &&
        config.commands.claim.updateTopic !== false
      ) {
        const claimedSuffix =
          config.commands.claim.claimedTopicSuffix !== undefined
            ? config.commands.claim.claimedTopicSuffix
            : "| 🔒 Claimed by: {claim.tag} ({claim.user})";

        if (claimedSuffix) {
          const unclaimedSuffix = (
            config.commands.claim.unclaimedTopicSuffix !== undefined
              ? config.commands.claim.unclaimedTopicSuffix
              : "| ❌ Unclaimed"
          ).trim();
          let baseTopic = (interaction.channel.topic || "").trim();

          // Remove unclaimed suffix if present
          if (unclaimedSuffix && baseTopic.endsWith(unclaimedSuffix)) {
            baseTopic = baseTopic.slice(0, -unclaimedSuffix.length).trim();
          }
          // Remove any previously set claimed suffix (handles reassignment).
          // Use the static part before {claim.tag} or {claim.user} as a reliable anchor to trim from.
          const suffixStaticPrefix = claimedSuffix
            .split("{claim.user}")[0]
            .split("{claim.tag}")[0]
            .trim();
          if (suffixStaticPrefix) {
            const idx = baseTopic.lastIndexOf(suffixStaticPrefix);
            if (idx !== -1) {
              baseTopic = baseTopic.slice(0, idx).trim();
            }
          }

          const newSuffix = claimedSuffix
            .replace(/\{claim\.tag\}/g, `<@${staffUser.id}>`)
            .replace(/\{claim\.user\}/g, staffUser.username);
          const newTopic = baseTopic ? `${baseTopic} ${newSuffix}` : newSuffix;
          // Discord topic limit is 1024 characters
          await interaction.channel
            .setTopic(newTopic.slice(0, 1024))
            .catch(() => {});
        }
      }

      if (!isReassignment) {
        await mainDB.add("totalClaims", 1);
      }
      await mainDB
        .delete(`isClaimInProgress-${interaction.channel.id}`)
        .catch((error) => {
          console.error(
            `Error deleting claim key for ticket #${interaction.channel.name}:`,
            error,
          );
        });

      let logChannelId = config.logs.ticketClaim || config.logs.default;
      let logsChannel = await getChannel(logChannelId);

      const logDefaultValues = {
        color: "#2FF200",
        title: isAssignment
          ? "Ticket Logs | Ticket Assigned"
          : "Ticket Logs | Ticket Claimed",
        timestamp: true,
        thumbnail: `${staffUser.displayAvatarURL({ extension: "png", size: 1024 })}`,
        footer: {
          text: `${staffUser.tag}`,
          iconURL: `${staffUser.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const logClaimedEmbed = await configEmbed(
        isAssignment ? "logAssignedEmbed" : "logClaimedEmbed",
        logDefaultValues,
      );

      logClaimedEmbed.addFields([
        {
          name:
            (isAssignment
              ? config.logAssignedEmbed.field_staff
              : config.logClaimedEmbed.field_staff) || "• Staff",
          value: `> <@!${staffUser.id}>\n> ${sanitizeInput(staffUser.tag)}`,
        },
        {
          name:
            (isAssignment
              ? config.logAssignedEmbed.field_ticket
              : config.logClaimedEmbed.field_ticket) || "• Ticket",
          value: `> <#${interaction.channel.id}>\n> #${sanitizeInput(interaction.channel.name)}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
        },
      ]);

      if (isAssignment) {
        logClaimedEmbed.addFields([
          {
            name: config.logAssignedEmbed.field_assigner || "• Assigned By",
            value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
          },
          {
            name: config.logAssignedEmbed.field_reason || "• Reason",
            value: `> ${reason || "No reason provided"}`,
          },
        ]);
      }

      if (config.toggleLogs.ticketClaim) {
        try {
          await logsChannel.send({ embeds: [logClaimedEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }
      await logMessage(
        isAssignment
          ? `${interaction.user.tag} assigned the ticket #${interaction.channel.name} to ${staffUser.tag}`
          : `${interaction.user.tag} claimed the ticket #${interaction.channel.name}`,
      );
    });
}

module.exports = {
  claimTicket,
};
