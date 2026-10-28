// The plugin's tests stay out of its bundle: were this one in, the plugin would fail to load.
throw new Error('A test file was bundled');
