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

async function claimTicket(interaction) {
  const totalClaims = await mainDB.get("totalClaims");
  const defaultValues = {
    color: "#2FF200",
    title: "Ticket Claimed",
    description: `This ticket has been claimed by {user}.\nThey will be assisting you shortly!`,
    timestamp: true,
    footer: {
      text: `Claimed by ${interaction.user.tag}`,
      iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
    },
  };

  const claimedEmbed = await configEmbed("claimedEmbed", defaultValues);

  if (claimedEmbed.data && claimedEmbed.data.description) {
    claimedEmbed.setDescription(
      claimedEmbed.data.description.replace(/\{user\}/g, interaction.user),
    );
  }

  await interaction.editReply({
    content: "You successfully claimed this ticket!",
    ephemeral: true,
  });
  await interaction.channel.send({ embeds: [claimedEmbed], ephemeral: false });
  await interaction.channel.messages
    .fetch(await ticketsDB.get(`${interaction.channel.id}.msgID`))
    .then(async (message) => {
      const embed = message.embeds[0];
      const claimedByField = {
        name: "Claimed by",
        value: `> <@!${interaction.user.id}> (${sanitizeInput(interaction.user.tag)})`,
      };
      embed.fields.push(claimedByField);
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
        const claimUsername = interaction.user.username;
        const claimDisplayname = interaction.member.displayName;

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

      await interaction.channel.permissionOverwrites.edit(interaction.user, {
        SendMessages: true,
        ViewChannel: true,
        AttachFiles: true,
        EmbedLinks: true,
        ReadMessageHistory: true,
      });

      await ticketsDB.set(`${interaction.channel.id}.claimed`, true);
      await ticketsDB.set(
        `${interaction.channel.id}.claimUser`,
        interaction.user.id,
      );
      await mainDB.set("totalClaims", totalClaims + 1);
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
        title: "Ticket Logs | Ticket Claimed",
        timestamp: true,
        thumbnail: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        footer: {
          text: `${interaction.user.tag}`,
          iconURL: `${interaction.user.displayAvatarURL({ extension: "png", size: 1024 })}`,
        },
      };

      const logClaimedEmbed = await configEmbed(
        "logClaimedEmbed",
        logDefaultValues,
      );

      logClaimedEmbed.addFields([
        {
          name: config.logClaimedEmbed.field_staff,
          value: `> <@!${interaction.user.id}>\n> ${sanitizeInput(interaction.user.tag)}`,
        },
        {
          name: config.logClaimedEmbed.field_ticket,
          value: `> <#${interaction.channel.id}>\n> #${sanitizeInput(interaction.channel.name)}\n> ${await ticketsDB.get(`${interaction.channel.id}.ticketType`)}`,
        },
      ]);

      if (config.toggleLogs.ticketClaim) {
        try {
          await logsChannel.send({ embeds: [logClaimedEmbed] });
        } catch (error) {
          error.errorContext = `[Logging Error]: please make sure to at least configure your default log channel`;
          client.emit("error", error);
        }
      }
      logMessage(
        `${interaction.user.tag} claimed the ticket #${interaction.channel.name}`,
      );
    });
}

module.exports = {
  claimTicket,
};
