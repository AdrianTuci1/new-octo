import { readFile, writeFile } from 'node:fs/promises';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value == null || value.startsWith('--')) {
      args[key] = '';
      continue;
    }

    args[key] = value;
    i += 1;
  }

  return args;
}

const args = parseArgs(process.argv);
for (const key of ['version', 'url', 'signature-file', 'output']) {
  if (!args[key]) {
    console.error(`Missing required argument --${key}`);
    process.exit(1);
  }
}

const signature = (await readFile(args['signature-file'], 'utf8')).trim();
if (!signature) {
  console.error(`Signature file is empty: ${args['signature-file']}`);
  process.exit(1);
}

const manifest = {
  version: args.version,
  url: args.url,
  signature
};

if (args.notes) {
  manifest.notes = args.notes;
}

if (args['pub-date']) {
  manifest.pub_date = args['pub-date'];
}

await writeFile(args.output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
