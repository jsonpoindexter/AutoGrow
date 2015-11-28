#build DB
sqlite3 AutoGrow.db 'DROP TABLE TempHumid;'
sqlite3 AutoGrow.db 'CREATE Table TempHumid(tempC int, tempF int, humidity int, unix_time bigint);'
sqlite3 AutoGrow.db 'DROP TABLE LightCycle;'
sqlite3 AutoGrow.db 'CREATE Table LightCycle(vegDaysMax int, vegDaysCurrent int, flowerDaysMax int, flowerDaysCurrent int, startVeg bigint);'