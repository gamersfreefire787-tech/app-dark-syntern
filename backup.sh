#!/bin/bash
mkdir -p backup
tar -czf backup/backup_$(date +%F).tar.gz akun bots
