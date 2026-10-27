# Optional integration source

The default supported demo entry point is the root docker-compose.yml.
The historical nginx/upgrade helpers and versioned avatar launchers were written
for an existing operator-managed installation. They are retained as integration
source, not a verified clean-machine deployment path.

No OpenAvatarChat checkout, LiteAvatar weights, voice models, third-party video,
or turnkey launcher ZIP is included. Review upstream licenses and obtain assets
separately. The local launcher expects WSL, an existing virtual environment and
an operator-owned tunnel script. Set CLASSROOM_PUBLIC_ORIGIN in both Windows and
the WSL runtime and OAC_LITEAVATAR_URL in Windows. Use your own HTTPS origins,
gateway and TURN credentials. The installer can also accept --origin explicitly.

Authorship and redistribution permission for the adapter source itself still
need owner confirmation before public release. None of these scripts was used
to contact or modify a production machine during this preparation.
