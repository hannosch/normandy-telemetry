.PHONY: all clean run

all: run

run:
	docker build -t hannosch/normandy-telemetry .
	docker run -it --rm --name='normandy-telemetry' \
		--volume `pwd`/data:/app/data \
		hannosch/normandy-telemetry

clean:
	docker rmi -f hannosch/normandy-telemetry
