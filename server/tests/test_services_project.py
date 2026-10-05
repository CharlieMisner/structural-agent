import json
from pathlib import Path
from server.dtos.project import CloudSoftwareConfigModel
from server.services.project import init_project, save_project_cloud_software, save_project_tool


def test_init_project_new(tmp_path: Path):
    res = init_project(str(tmp_path))
    assert res.created is True
    assert res.id is not None
    assert (tmp_path / ".statikor" / "project.json").exists()


def test_init_project_existing(tmp_path: Path):
    statikor_dir = tmp_path / ".statikor"
    statikor_dir.mkdir(parents=True)
    with open(statikor_dir / "project.json", "w", encoding="utf-8") as f:
        json.dump({"id": "custom-uuid-123", "cloud-software": []}, f)

    res = init_project(str(tmp_path))
    assert res.created is False
    assert res.id == "custom-uuid-123"


def test_init_project_corrupted_json(tmp_path: Path):
    statikor_dir = tmp_path / ".statikor"
    statikor_dir.mkdir(parents=True)
    with open(statikor_dir / "project.json", "w", encoding="utf-8") as f:
        f.write("corrupted json!")

    res = init_project(str(tmp_path))
    assert res.created is True


def test_save_project_cloud_software(tmp_path: Path):
    sw1 = CloudSoftwareConfigModel(
        id="forteweb",
        name="ForteWEB",
        authenticated=True,
        username="user1@example.com",
    )
    res = save_project_cloud_software(str(tmp_path), sw1)
    assert res["status"] == "ok"
    assert len(res["config"]["cloud-software"]) == 1
    assert res["config"]["cloud-software"][0]["id"] == "forteweb"

    # Update existing
    sw1_updated = CloudSoftwareConfigModel(
        id="forteweb",
        name="ForteWEB",
        authenticated=True,
        username="user1_updated@example.com",
    )
    res2 = save_project_cloud_software(str(tmp_path), sw1_updated)
    assert len(res2["config"]["cloud-software"]) == 1
    assert res2["config"]["cloud-software"][0]["username"] == "user1_updated@example.com"

    # Add second software
    sw2 = CloudSoftwareConfigModel(id="enercalc", name="Enercalc", authenticated=False)
    res3 = save_project_tool(str(tmp_path), sw2)
    assert len(res3["config"]["cloud-software"]) == 2


def test_save_project_cloud_software_migration(tmp_path: Path):
    # Test reading legacy keys 'tools' and 'cloudSoftware'
    statikor_dir = tmp_path / ".statikor"
    statikor_dir.mkdir(parents=True)
    with open(statikor_dir / "project.json", "w", encoding="utf-8") as f:
        json.dump({"id": "legacy", "tools": [{"id": "legacy_tool", "name": "Legacy"}]}, f)

    sw = CloudSoftwareConfigModel(id="new_tool", name="New Tool", authenticated=True)
    res = save_project_cloud_software(str(tmp_path), sw)
    assert len(res["config"]["cloud-software"]) == 2
    assert "tools" not in res["config"]
