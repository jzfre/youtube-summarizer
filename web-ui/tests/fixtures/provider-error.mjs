process.stderr.write(JSON.stringify({ error: { code: process.argv.at(-1), message: 'SECRET provider response' } }));
process.exitCode = 1;
