import process from 'node:process';
import { Command } from 'commander';

const program = new Command();

program
  .name('schema-memory')
  .alias('sm')
  .description('Live database schema memory & ADR workflow for AI pair programming')
  .version('0.1.0');

program.parse(process.argv);
