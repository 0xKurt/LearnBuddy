// The learning domain's part of the test fakes (issue #107), loaded before every test file
// (vitest.config.ts `setupFiles`): the scripted gateway answers its form choice (#627) as the real
// chooser would. A core copy writes this file empty (create-buddy --core).
// requires live verification in Claude Code session (paired with a real Postgres)

import { chosenFor, fitted, isChoosing, offered, usedBy } from '../modules/practice/formChoice.js';
import { setFakeChooser } from './chooser.js';

setFakeChooser({ isChoosing, chosenFor, usedBy, offered, fitted });
