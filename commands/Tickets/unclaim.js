const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const yaml = require("yaml");
const configFile = fs.readFileSync("./config.yml", "utf8");
const config = yaml.parse(configFile);
const { ticketsDB } = require("../../init.js");
const { checkSupportRole } = require("../../utils/mainUtils.js");
const { unclaimTicket } = require("../../utils/ticketUnclaim.js");

module.exports = {
  enabled: config.commands.unclaim.enabled,
  data: new SlashCommandBuilder()
    .setName("unclaim")
    .setDescription("Unclaim a ticket")
    .setDefaultMemberPermissions(
      PermissionFlagsBits[config.commands.unclaim.permission],
    )
    .setDMPermission(false),
  async execute(interaction) {
    if (!(await ticketsDB.has(interaction.channel.id))) {
      return interaction.reply({
        content:
          config.errors.not_in_a_ticket || "You are not in a ticket channel!",
        ephemeral: true,
      });
    }

    const hasSupportRole = await checkSupportRole(interaction);
    if (!hasSupportRole) {
      return interaction.reply({
        content:
          config.errors.not_allowed || "You are not allowed to use this!",
        ephemeral: true,
      });
    }

    if (config.claimFeature === false) {
      return interaction.reply({
        content: "The claim feature is currently disabled.",
        ephemeral: true,
      });
    }

    if ((await ticketsDB.get(`${interaction.channel.id}.claimed`)) === false) {
      return interaction.reply({
        content: "This ticket has not been claimed!",
        ephemeral: true,
      });
    }

    if (
      (await ticketsDB.get(`${interaction.channel.id}.claimUser`)) !==
      interaction.user.id
    ) {
      return interaction.reply({
        content: `You did not claim this ticket, only the user that claimed this ticket can unclaim it! (<@!${await ticketsDB.get(`${interaction.channel.id}.claimUser`)}>)`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });
    await unclaimTicket(interaction);
  },
};
