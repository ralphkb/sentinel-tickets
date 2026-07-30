const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { mainDB } = require("../../init.js");

module.exports = {
  enabled: true,
  data: new SlashCommandBuilder()
    .setName("clearclaimlock")
    .setDescription("Clear all stuck claim locks from tickets")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const allKeys = await mainDB.all();
      const claimKeys = allKeys.filter((entry) =>
        entry.id.startsWith("isClaimInProgress-"),
      );

      if (claimKeys.length === 0) {
        return interaction.editReply({
          content: "✅ No claim locks found in the database.",
        });
      }

      let cleared = 0;
      let failed = 0;
      const lockDetails = [];

      for (const entry of claimKeys) {
        const lockData = entry.value;
        const lockAge = Date.now() - (lockData.timestamp || lockData);
        const lockAgeSeconds = Math.floor(lockAge / 1000);
        const channelId = entry.id.replace("isClaimInProgress-", "");

        try {
          await mainDB.delete(entry.id);
          cleared++;
          lockDetails.push(`• <#${channelId}> - ${lockAgeSeconds}s old`);
        } catch (error) {
          failed++;
          console.error(`Error deleting claim key ${entry.id}:`, error);
        }
      }

      const summary = [
        `✅ **Claim Lock Cleanup Complete**`,
        ``,
        `📊 **Statistics:**`,
        `• Total locks found: ${claimKeys.length}`,
        `• Successfully cleared: ${cleared}`,
        failed > 0 ? `• Failed: ${failed}` : null,
        ``,
      ]
        .filter(Boolean)
        .join("\n");

      const details =
        lockDetails.length <= 10
          ? `**Cleared Locks:**\n${lockDetails.join("\n")}`
          : `**Cleared Locks:**\n${lockDetails.slice(0, 10).join("\n")}\n... and ${lockDetails.length - 10} more`;

      return interaction.editReply({
        content: `${summary}\n${details}`,
      });
    } catch (error) {
      console.error("Error clearing all claim locks:", error);
      return interaction.editReply({
        content: `❌ Error clearing claim locks: ${error.message}`,
      });
    }
  },
};
