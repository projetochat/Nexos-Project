import copy
import unittest

from preflight import CheckError, validate_config


def config():
    url = "postgresql://trixus:test%40password@postgres:5432/trixus?schema=public"
    return {
        "name": "trixus-vps",
        "services": {
            "postgres": {"environment": {"POSTGRES_DB": "trixus", "POSTGRES_USER": "trixus",
                                         "POSTGRES_PASSWORD": "test@password"}},
            "redis": {},
            "migrate": {"environment": {"DATABASE_URL": url}},
            "backend": {"environment": {"DATABASE_URL": url},
                        "ports": [{"host_ip": "127.0.0.1", "published": "3001"}],
                        "volumes": [{"type": "bind", "source": "/srv/trixus-data",
                                     "target": "/var/lib/trixus/storage"}]},
            "frontend": {"ports": [{"host_ip": "127.0.0.1", "published": "4173"}]},
        },
    }


class PreflightTest(unittest.TestCase):
    def test_accepts_expected_configuration_and_encoded_password(self):
        validate_config(config())

    def test_blocks_configuration_that_could_escape_trixus(self):
        base = config()
        mutations = [
            lambda c: c.update(name="glpi"),
            lambda c: c["services"]["backend"].update(privileged=True),
            lambda c: c["services"]["backend"].update(network_mode="host"),
            lambda c: c["services"]["backend"].update(cap_add=["SYS_ADMIN"]),
            lambda c: c["services"]["backend"]["volumes"][0].update(source="/"),
            lambda c: c["services"]["frontend"].update(volumes=[{"type": "bind", "source": "/var/run/docker.sock"}]),
            lambda c: c["services"]["backend"]["ports"][0].update(host_ip="0.0.0.0"),
            lambda c: c["services"]["postgres"]["environment"].update(POSTGRES_DB="glpi"),
            lambda c: c["services"]["migrate"]["environment"].update(DATABASE_URL="postgresql://localhost/glpi"),
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                candidate = copy.deepcopy(base)
                mutation(candidate)
                with self.assertRaises(CheckError):
                    validate_config(candidate)


if __name__ == "__main__":
    unittest.main()
