import json

from flask import jsonify, request, Blueprint, current_app
from flask_discord import requires_authorization

from piracymoe import utils

app = current_app
bp = Blueprint('api', __name__)


@bp.route("/api/health")
def health():
    """ Heartbeat used for uptime monitoring purposes. """
    return "Ok"


@bp.route("/api/fetch/tables")
def fetch_tables():
    """ Used by the frontend, returns a JSON list of all the tables including metadata. """
    """
    return jsonify([
        {
            "tab": "animeTables",
            "name": "Anime",
            "tables": [
                {
                    "id": "englishAnimeSites",
                    "title": "English Streaming Sites",
                    "type": "anime"
                }
            ]
        },
        {
            "tab": "mangaTables",
            "name": "Manga",
            "tables": [
                {
                    "id": "englishMangaAggregators",
                    "title": "Aggregators",
                    "type": "manga"
                }
            ]
        },
    ])
    """
    return jsonify([
        {
            "tab": "animeTables",
            "name": "Anime",
            "tables": [
                {
                    "id": "tvReleases",
                    "title": "TV",
                    "type": "anime"
                }
            ]
        },
        {
            "tab": "mangaTables",
            "name": "Manga",
            "tables": [
                {
                    "id": "englishMangaAggregators",
                    "title": "Aggregators",
                    "type": "manga"
                }
            ]
        },
    ])


@bp.route("/api/fetch/columns")
def fetch_columns():
    """ Used by the frontend, returns a JSON list of all the columns in use with metadata. """
    return jsonify({
        "keys": {
            "title": {
                "name": "Title",
                "description": "The sites name"
            },
            "alternateTitle": {
                "name": "Alternate Title",
                "description": "The sites address"
            },
            "bestRelease": {
                "name": "Best Release",
                "description": "Does the site have ads"
            },
            "alternateRelease": {
                "name": "Alternate Release",
                "description": "Does the site block adblockers"
            },
            "resolution": {
                "name": "Resolution",
                "description": "Does the site offer subs"
            },
            "dualAudio": {
                "name": "Dual Audio",
                "description": "Does the site offer dubs"
            },
            "notes": {
                "name": "Notes",
                "description": "Does the site offer 360p streams"
            }
        },
        "types": {
            "anime": [
                {
                    "key": "title",
                    "hidden": False
                },
                {
                    "key": "alternateTitle",
                    "hidden": False
                },
                {
                    "key": "bestRelease",
                    "hidden": False
                },
                {
                    "key": "alternateRelease",
                    "hidden": False
                },
                {
                    "key": "resolution",
                    "hidden": False
                },
                {
                    "key": "dualAudio",
                    "hidden": False
                },
                {
                    "key": "notes",
                    "hidden": False
                }
            ],
            "manga": [
                {
                    "key": "siteName",
                    "hidden": False
                },
                {
                    "key": "hasAds",
                    "hidden": False
                },
                {
                    "key": "hasAntiAdblock",
                    "hidden": True
                },
                {
                    "key": "languages",
                    "hidden": False
                },
                {
                    "key": "isMobileFriendly",
                    "hidden": True
                },
                {
                    "key": "malSyncSupport",
                    "hidden": False
                },
                {
                    "key": "hasTachiyomiSupport",
                    "hidden": False
                },
                {
                    "key": "features",
                    "hidden": True
                },
                {
                    "key": "editorNotes",
                    "hidden": True
                }
            ],
        }
    })


@bp.route("/api/fetch/columns/<table>")
def fetch_columns_by_table(table):
    """ Used by the frontend, returns a JSON list of all the columns for the table specified. """
    db = utils._get_database()
    table = db.load_table(table)

    if not table.exists:
        return "table does not exist"
    
    db.close()
    return jsonify(table.columns)


@bp.route("/api/fetch/tables/<tab>")
def fetch_tables_by_tab(tab):
    """ 
    Used by the frontend, returns a JSON list of all the tables for the tab specified. 

        Parameters:
            tab (str): The tab requested by the frontend.

        Returns:
            data (flask.Response): Response containing a list of the tabs tables in JSON format.
    """
    tabs = {
        "anime": ["tvReleases"],
        "manga": ["englishMangaAggregators"],
    }

    if tab not in tabs:
        return "tab does not exist"

    return jsonify(tabs[tab])


@bp.route("/api/fetch/data/<table>")
def fetch_data_by_table(table):
    """ 
    Used by the frontend, returns a JSON list of all the data (rows and columns) for the table specified. 

        Parameters:
            table (str): The table requested by the frontend.

        Returns:
            data (flask.Response): Response containing the data in JSON format.
    """
    db = utils._get_database()
    table = db.load_table(table)

    if not table.exists:
        return "table does not exist"

    """ 
    For some reason, accessing all the data in the table
    as Python objects causes a memory leak that results
    in memory exhaustion and an endless crash-reboot
    loop but this manual SQL query works just fine. :^)
    """
    results = db.query(f"SELECT * from {table.name}")
    data = []
    for row in results:
        data.append(row)
    db.close()
    return jsonify(data)


@bp.route("/api/update/<table>", methods=["POST"])
@requires_authorization
def update_table_entry(table):
    db = utils._get_database()
    table = db.load_table(table)

    # error if table doesn't exist
    if not table.exists:
        return "table does not exist"

    # attempt to get POST data
    data = request.get_json()

    # error if did not receive POST data
    if not data:
        return "received no POST JSON data"

    # lookup entry from POST data in database by id
    before = table.find_one(id=data["id"])

    # error if did entry did not exist in database
    if before is None:
        return "id does not exist"

    data["siteAddresses"] = json.dumps(data["siteAddresses"])

    before = dict(before)
    after = request.get_json()

    utils._send_webhook_message(user=app.discord.fetch_user(), operation="update",
                                table=table.name, before=before,
                                after=after)

    table.update(data, ["id"])
    db.close()
    return "updated"


@bp.route("/api/insert/<table>", methods=["POST"])
@requires_authorization
def insert_new_entry(table):
    """ insert new data entry in table """
    db = utils._get_database()
    table = db.load_table(table)

    if not table.exists:
        return "table does not exist"

    data = request.get_json()
    if not data:
        return "received no POST JSON data"

    data["siteAddresses"] = json.dumps(data["siteAddresses"])

    utils._send_webhook_message(user=app.discord.fetch_user(), operation="insert",
                                table=table.name, after=data)

    table.insert(data)
    db.close()
    return "inserted"


@bp.route("/api/delete/<table>/<id>")
@requires_authorization
def delete_entry(table, id):
    """ deletes data entry in table """
    db = utils._get_database()
    table = db.load_table(table)

    if not table.exists:
        return "table does not exist"

    data = table.find_one(id=id)
    if data is None:
        return "id does not exist"

    utils._send_webhook_message(user=app.discord.fetch_user(), operation="delete",
                                table=table.name, after=data)

    table.delete(id=id)
    db.close()
    return "deleted"
