import { spawn } from 'node:child_process';
const procs=[spawn('npm',['run','dev','-w','server'],{stdio:'inherit',shell:true}),spawn('npm',['run','dev','-w','client'],{stdio:'inherit',shell:true})];
const stop=()=>procs.forEach(p=>p.kill());process.on('SIGINT',()=>{stop();process.exit(0)});process.on('SIGTERM',()=>{stop();process.exit(0)});
