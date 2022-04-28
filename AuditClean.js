var runLog = '', //fix script gs.info is awful, aggregate it and show it all at once
	tablesToClean = ['task'],
	verbose = true,
	deleteRecords = false, //show preview of affected records when verbose is true and this is false
	keepLatest100 = false,
	displayChildTable = false, //a lot faster w/o, only need with root table ie task
	jiraOnly = false, //pm_project, pm_project_task, story, scrumm_task tables
	maxUpdates = 1000; //5000 is a safe number, problems start to occur at 12,000

for (var t = 0; t < tablesToClean.length; t++) {
    var table = tablesToClean[t];
    var link = 'https://' + gs.getProperty('instance_name') + '.service-now.com/' + table + '_list.do?sysparm_query=sys_idIN';
    log('■■■■■■ 💠 TABLE: ' + table + ' ■■■■■■■■■');
    if (jiraOnly) {
        var grVal = new GlideRecord('sys_dictionary');
        grVal.addQuery('name', table);
        grVal.addQuery('element', 'u_jira_id').addOrCondition('element', 'u_jira_deleted_id').addOrCondition('element', 'u_issue_id').addOrCondition('element', 'u_deleted_id');
        grVal.query();
        if (!grVal.hasNext()) {
            throw 'Checking for Jira on a table without a u_jira_id or u_jira_deleted_id!';
        }
    }

    var gr = new GlideRecord(table);
    gr.addQuery('sys_mod_count', '>=', maxUpdates);
    if (jiraOnly)
        gr.addEncodedQuery('u_issue_idISNOTEMPTY^ORu_deleted_idISNOTEMPTY&u_jira_idISNOTEMPTY^ORu_jira_deleted_idISNOTEMPTY');
    gr.query();
    var array = [];
    while (gr.next()) {
        array.push(gr.sys_id + '');
    }

    //Audit History
    var arrayAudit = buildArray('sys_audit', 'documentkey', '🕵️ AUDIT', 'tablename');

    //Journal History (work notes/comments)
    var arrayJournal = buildArray('sys_journal_field', 'element_id', '💬 JOURNAL', 'name');

    //Relationship History (record to record relationships)
    var arrayRelation = buildArray('sys_audit_relation', 'documentkey', '💑 RELATION', 'tablename');

    if (keepLatest100 || deleteRecords) {
        //Clean Audit Records
        for (var i = 0; i < arrayAudit.length; i++) {
            cleanRecord('sys_audit', 'documentkey', arrayAudit[i], 'Audit');
        }
        //Clean Journal Records
        for (var x = 0; x < arrayJournal.length; x++) {
            cleanRecord('sys_journal_field', 'element_id', arrayJournal[x], 'Journal');
        }

        //Clean Relationship Records
        for (var y = 0; y < arrayRelation.length; y++) {
            cleanRecord('sys_audit_relation', 'documentkey', arrayRelation[y], 'Relation');
        }
    }
}

if (verbose == true)
    gs.info('\n██████████████ LOG OUTPUT ██████████████\n\n' + runLog);

function log(msg) {
    if (verbose == true)
        runLog += msg + '\n';
}

function updateOrigin(type, sysid, count) {
    var grOrigin = new GlideRecord(table);
    if (grOrigin.get(sysid)) {
        grOrigin.work_notes = count + ' ' + type + ' records have been deleted due to an large amount. This was done to allow the record to load.';
        grOrigin.update();
    }
}

function cleanRecord(table, field, sysid, origin) {
    var grClean = new GlideRecord(table);
    grClean.addQuery(field, sysid);
    grClean.orderBy('sys_created_on');
    if (keepLatest100)
        grClean.chooseWindow(100, 100000000);
    grClean.query();
    var count = grClean.getRowCount();
    if (keepLatest100) {
        var cleanIndex = 0;
        while (grClean.next()) {
            if (cleanIndex == 0)
                log('first: ' + grClean.sys_created_on);
            cleanIndex++;
            if (deleteRecords) {
                grClean.deleteRecord();
            }
        }
        log('cleanIndex: ' + cleanIndex + ' Last: ' + grClean.sys_created_on);
        updateOrigin(origin, sysid, count);
    }
    if (deleteRecords && !keepLatest100) {
        grClean.deleteMultiple();
        updateOrigin(origin, sysid, count);
    }

    if (deleteRecords) {
        var grSet = new GlideRecord('sys_history_set');
        grSet.addQuery('id', sysid);
        grSet.query();
        grSet.deleteMultiple();
    }
}

function buildArray(table, field, type, tablename) {
    var tempArray = [];
    var ga = new GlideAggregate(table);
    ga.addQuery(field, 'IN', array + '');
    ga.groupBy(field);
    if (displayChildTable)
        ga.groupBy(tablename);
    ga.addAggregate('COUNT', field);
    if (displayChildTable)
        ga.addAggregate('COUNT', tablename);
    ga.orderByAggregate('COUNT', field);
    ga.query();
    log('_ ' + type + ' COUNTS ________________________');
    while (ga.next()) {
        var count = ga.getAggregate('COUNT', field);
        if (count > maxUpdates) {
            log(ga[tablename] + ' [' + ga[field] + ']: ' + count);
            tempArray.push(ga[field] + '');
        }
    }
    log(link + tempArray);
    return tempArray;
}
