var deleteRecords = false;
var keepLatest100 = false;
var returnChildTable = true; //a lot faster w/o, only need with root table ie task
var jiraOnly = false; //pm_project, pm_project_task, story, scrumm_task tables
var verbose = true;
var table = 'pm_project';
var maxUpdates = 1000; //5000 is a safe number, problems start to occur at 12,000

var grVal = new GlideRecord('sys_dictionary');
grVal.addQuery('name', table)
grVal.addQuery('element', 'u_jira_id').addOrCondition('element', 'u_jira_deleted_id').addOrCondition('element', 'u_issue_id').addOrCondition('element', 'u_deleted_id');
grVal.query();
if (!grVal.hasNext()) {
    throw 'Checking for Jira on a table without a u_jira_id or u_jira_deleted_id!';
}

function updateOrigin(type) {
    var grOrigin = new GlideRecord(table);
    if (grOrigin.get(arrayAudit[i])) {
        grOrigin.work_notes = count + ' ' + type + ' records have been deleted due to an large amount. This was done to allow the record to load.';
        grOrigin.update();
    }
}

function log(msg) {
    if (verbose == true)
        gs.info(msg);
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
        var x = 0;
        while (grClean.next()) {
            if (x == 0)
                log('first: ' + grClean.sys_created_on);
            x++;
            if (deleteRecords) {
                grClean.deleteRecord();
            }
        }
        log('x: ' + x + ' Last: ' + grClean.sys_created_on);
        updateOrigin(origin);
    }
    if (deleteRecords && !keepLatest100) {
        grClean.deleteMultiple();
        updateOrigin(origin);
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
    if (returnChildTable)
        ga.groupBy(tablename);
    ga.addAggregate('COUNT', field);
    if (returnChildTable)
        ga.addAggregate('COUNT', tablename);
    ga.orderByAggregate('count', field);
    ga.query();
    gs.info('_ ' + type + ' COUNTS ________________________');
    while (ga.next()) {
        var count = ga.getAggregate('COUNT', field);
        if (count > maxUpdates) {
            log(ga[tablename] + ' [' + ga[field] + ']: ' + count);
            tempArray.push(ga[field] + '');
        }
    }
    gs.info(tempArray + '');
    return tempArray;
}

var gr = new GlideRecord(table);
gr.addQuery('sys_mod_count', '>=', maxUpdates);
if (jiraOnly)
    gr.addEncodedQuery('u_issue_idISNOTEMPTY^ORu_deleted_idISNOTEMPTY');
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
    for (var i = 0; i < arrayJournal.length; i++) {
        cleanRecord('sys_journal_field', 'element', arrayJournal[i], 'Journal');
    }
  
  //Clean Relationship Records
    for (var i = 0; i < arrayRelation.length; i++) {
        cleanRecord('sys_audit_relation_list', 'element', arrayRelation[i], 'Relation');
    }
}
