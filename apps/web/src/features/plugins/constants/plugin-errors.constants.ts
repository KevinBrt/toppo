/** Why the server refused a zip, in words an administrator can act on. */
export const INSTALL_ERRORS = {
  PLUGIN_PACKAGE_INVALID: 'plugins.errors.packageInvalid',
  PLUGIN_MANIFEST_UNREADABLE: 'plugins.errors.manifestUnreadable',
  PLUGIN_MANIFEST_INVALID: 'plugins.errors.manifestInvalid',
  PLUGIN_API_INCOMPATIBLE: 'plugins.errors.apiIncompatible',
  PLUGIN_ID_RESERVED: 'plugins.errors.idReserved',
  PLUGIN_LIMIT_REACHED: 'plugins.errors.limitReached',
  PLUGIN_INSTALL_RUNNING: 'plugins.errors.installRunning',
  PLUGIN_TOO_LARGE: 'plugins.errors.tooLarge',
  LENGTH_REQUIRED: 'plugins.errors.uploadIncomplete',
  UPLOAD_INCOMPLETE: 'plugins.errors.uploadIncomplete',
} as const;

/** Why an approval was refused. */
export const APPROVAL_ERRORS = {
  PLUGIN_NOT_FOUND: 'plugins.errors.notFound',
  PROJECT_NOT_FOUND: 'plugins.errors.projectNotFound',
  PLUGIN_USER_EMAIL_TAKEN: 'plugins.errors.userEmailTaken',
  PLUGIN_SETTINGS_REFUSED: 'plugins.errors.settingsRefused',
} as const;

/** Why its settings were not saved. */
export const SETTINGS_ERRORS = {
  PLUGIN_NOT_FOUND: 'plugins.errors.notFound',
  PLUGIN_SETTINGS_INVALID: 'plugins.errors.settingsInvalid',
  PLUGIN_CHANGED: 'plugins.errors.pluginChanged',
} as const;

/** Why enabling, disabling or uninstalling a plugin was refused. */
export const CHANGE_ERRORS = {
  PLUGIN_NOT_FOUND: 'plugins.errors.notFound',
  PLUGIN_NOT_APPROVED: 'plugins.errors.notApproved',
} as const;
