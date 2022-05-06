var runLog = '', //fix script gs.info is awful, aggregate it and show it all at once
processAudit = true,
processJournal = true,
processRelation = false,
isGlobal = false, //###NEED TO IMPLEMENT###dont clean a specific table just search all audit records for high counts
displayValue = true, //Log info shows display value of the table records count
tablesToClean = ['sys_user'], //['task','sys_user']
linkAuditRecord = false, //provides html link to view audit records (use in xplore to render)
verbose = true, //log record counts
deleteSystemOnly = true, //Only delete system created records on sys_user table. Fixes erronous flapping of ad ldap auth and ldap sys import tz conflicts bug
deleteOnlyOverAYear = true,
deleteRecords = false, //show preview of affected records when verbose is true and this is false
keepLatest100 = false,
displayChildTable = false, //a lot faster w/o, only need with root table ie task
jiraOnly = false, //pm_project, pm_project_task, story, scrumm_task tables
updatesFloor = 1000; //5000 is a safe number, problems start to occur at 12,000

if (!isGlobal) {
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
        gr.addQuery('sys_mod_count', '>=', updatesFloor);
        if (jiraOnly)
            gr.addEncodedQuery('u_issue_idISNOTEMPTY^ORu_deleted_idISNOTEMPTY&u_jira_idISNOTEMPTY^ORu_jira_deleted_idISNOTEMPTY');
        gr.query();
        var array = [];
        while (gr.next()) {
            array.push(gr.sys_id + '');
        }

        //Audit History
        var arrayAudit = buildArray('sys_audit', 'documentkey', '🕵️ AUDIT', 'tablename', table);

        //Journal History (work notes/comments)
        var arrayJournal = buildArray('sys_journal_field', 'element_id', '💬 JOURNAL', 'name', table);

        //Relationship History (record to record relationships)
        var arrayRelation = buildArray('sys_audit_relation', 'documentkey', '💑 RELATION', 'tablename', table);

        if (keepLatest100 || deleteRecords) {
            //Clean Audit Records
            if (processAudit) {
                for (var i = 0; i < arrayAudit.length; i++) {
                    cleanRecord('sys_audit', 'documentkey', arrayAudit[i], 'Audit');
                }
            }
            //Clean Journal Records
            if (processJournal) {
                for (var x = 0; x < arrayJournal.length; x++) {
                    cleanRecord('sys_journal_field', 'element_id', arrayJournal[x], 'Journal');
                }
            }

            //Clean Relationship Records
            if (processRelation) {
                for (var y = 0; y < arrayRelation.length; y++) {
                    cleanRecord('sys_audit_relation', 'documentkey', arrayRelation[y], 'Relation');
                }
            }
        }
    }

    if (verbose == true)
        gs.info('\n██████████████ LOG OUTPUT ██████████████\n\n' + runLog);

} else {
    var tablesToCheck = ['sys_audit', 'sys_journal_field', 'sys_audit_relation'];
    for (var v = 0; v < tablesToCheck.length; v++) {
        var updatesFloor = 5000;
        var table = tablesToCheck[v];
        if (table == 'sys_audit')
            var field = 'fieldname';
        if (table == 'sys_journal_field')
            var field = 'element_id';
        if (table == 'sys_audit_relation')
            var field = 'documentkey';
        log('■■■■■■ 💠 TABLE: ' + table + ', FIELD: + ' + field + ' ■■■■■■■■■');
        var displayChildTable = false;
        var tempArray = [];
        var ga = new GlideAggregate(table);
        ga.addAggregate('COUNT', field);
        ga.orderByAggregate('COUNT', field);
        ga.query();
        while (ga.next()) {
            var count = ga.getAggregate('COUNT', field);
            if (count > updatesFloor) {
                log('[' + ga[field] + ']: ' + count);
            }
        }
    }
}

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
    if (deleteOnlyOverAYear)
        grClean.addEncodedQuery('sys_created_onRELATIVELT@dayofweek@ago@365');
    if (deleteSystemOnly && origin == 'sys_user')
        grClean.addQuery('sys_created_by', 'system');
    grClean.orderBy('sys_created_on');
    if (keepLatest100)
        grClean.chooseWindow(100, 100000000);
    grClean.query();
    var count = grClean.getRowCount();
    if (keepLatest100) {
        var cleanIndex = 0;
        while (grClean.next()) {
            if (cleanIndex == 0)
                log('keep latest 100 first: ' + grClean.sys_created_on);
            cleanIndex++;
            if (deleteRecords) {
                grClean.deleteRecord();
            }
        }
        log('keep latest 100 cleanIndex: ' + cleanIndex + ' Last: ' + grClean.sys_created_on);
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

function buildArray(table, field, type, tablename, sourceTable) {
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
        if (count > updatesFloor) {
            if (displayValue) {
                var grDisplay = new GlideRecord(sourceTable);
                if (grDisplay.get(ga[field])) {
                    if (linkAuditRecord) {
                        var href = '<a href="/' + table + '_list.do?sysparm_query=' + field + '='
                             + ga[field] + '" target="_blank">' + grDisplay.getDisplayValue() + '</a>';
                        log(ga[tablename] + ' [' + href + ']: ' + count);
                    } else {
                        log(ga[tablename] + ' [' + grDisplay.getDisplayValue() + ']: ' + count);
                    }
                }
            } else {
                if (linkAuditRecord) {
                    var href = '<a href="/' + table + '_list.do?sysparm_query=' + field + '='
                         + ga[field] + '" target="_blank">' + ga[field] + '</a>';
                    log(ga[tablename] + ' [' + href + ']: ' + count);
                } else {
                    log(ga[tablename] + ' [' + ga[field] + ']: ' + count);
                }
            }
            tempArray.push(ga[field] + '');
        }
    }
    log(link + tempArray);
    return tempArray;
}
